package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const (
	// The webapp registers this user setting; Mattermost stores it as a preference.
	settingName = "read_receipts"
	settingOff  = "off"

	// Sent to the other members when someone's watermark moves.
	receiptEvent = "receipt"

	kvRetries = 5
)

type Plugin struct {
	plugin.MattermostPlugin
	router   http.Handler
	settings settings
}

func (p *Plugin) OnActivate() error {
	p.router = p.newRouter()
	return nil
}

func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

// MessageHasBeenPosted marks the post delivered to members with a client connected
// right now. That covers the mobile apps, which do not run the webapp part.
func (p *Plugin) MessageHasBeenPosted(_ *plugin.Context, post *model.Post) {
	// Typed posts are system messages or plugin cards, which nobody reads as a message.
	if post.Type != "" {
		return
	}
	conv, err := p.conversation(post.ChannelId, post.UserId)
	if err != nil {
		return
	}
	now := model.GetMillis()
	for _, userID := range conv.recipients {
		status, appErr := p.API.GetUserStatus(userID)
		if appErr != nil || (status.Status != model.StatusOnline && status.Status != model.StatusAway) {
			continue
		}
		p.record(conv.channel.Id, userID, func(pr *progress) bool { return pr.markDelivered(post.CreateAt, now) })
	}
}

// conversation is a channel with read receipts (a direct or group message, or a
// small enough channel) seen by one of its members.
type conversation struct {
	channel *model.Channel
	// Active human members other than the viewer.
	recipients []string
}

var errNotConversation = errors.New("channel without read receipts")

func isMessageChannel(channel *model.Channel) bool {
	return channel.Type == model.ChannelTypeDirect || channel.Type == model.ChannelTypeGroup
}

// Public and private channels get receipts only up to the configured size: in a
// big channel "read by everybody" never happens and every read wakes all members.
func (p *Plugin) tracksChannel(channel *model.Channel) (bool, error) {
	if isMessageChannel(channel) {
		return true, nil
	}
	if channel.Type != model.ChannelTypeOpen && channel.Type != model.ChannelTypePrivate {
		return false, nil
	}
	limit := p.settings.maxChannelMembers.Load()
	if limit == 0 {
		return false, nil
	}
	stats, appErr := p.API.GetChannelStats(channel.Id)
	if appErr != nil {
		return false, appErr
	}
	return stats.MemberCount <= limit, nil
}

func (p *Plugin) conversation(channelID, userID string) (*conversation, error) {
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		return nil, appErr
	}
	tracked, err := p.tracksChannel(channel)
	if err != nil {
		return nil, err
	}
	if !tracked {
		return nil, errNotConversation
	}
	// Group messages have at most 8 members and tracked channels at most
	// maxChannelMembersCap, so one page is all of them.
	members, appErr := p.API.GetChannelMembers(channelID, 0, 200)
	if appErr != nil {
		return nil, appErr
	}
	conv := &conversation{channel: channel}
	isMember := false
	for _, m := range members {
		if m.UserId == userID {
			isMember = true
			continue
		}
		user, appErr := p.API.GetUser(m.UserId)
		if appErr != nil {
			return nil, appErr
		}
		if isRecipient(user) {
			conv.recipients = append(conv.recipients, m.UserId)
		}
	}
	if !isMember {
		return nil, errors.New("not a member of the channel")
	}
	return conv, nil
}

// isRecipient leaves out bots, which do not read, and deactivated users, who
// stay members of their channels but will never read again.
func isRecipient(user *model.User) bool {
	return !user.IsBot && user.DeleteAt == 0
}

func (p *Plugin) isDirect(conv *conversation) bool {
	return conv.channel.Type == model.ChannelTypeDirect
}

// readReceiptsOff reports whether the user turned read receipts off. Like in
// WhatsApp it only applies to direct messages (groups and channels always have
// receipts) and works both ways: their reads
// are not recorded and they do not see anybody else's.
func (p *Plugin) readReceiptsOff(userID string) bool {
	pref, appErr := p.API.GetPreferenceForUser(userID, "pp_"+manifestID, settingName)
	return appErr == nil && pref.Value == settingOff
}

func progressKey(channelID, userID string) string {
	return "p_" + channelID + "_" + userID
}

func (p *Plugin) loadProgress(channelID, userID string) (progress, []byte, error) {
	var pr progress
	raw, appErr := p.API.KVGet(progressKey(channelID, userID))
	if appErr != nil {
		return pr, nil, appErr
	}
	if raw == nil {
		return pr, nil, nil
	}
	if err := json.Unmarshal(raw, &pr); err != nil {
		return pr, nil, fmt.Errorf("decode progress %s/%s: %w", channelID, userID, err)
	}
	return pr, raw, nil
}

// record applies change to a member's progress and, if a watermark moved, tells
// the other members so their check marks refresh.
func (p *Plugin) record(channelID, userID string, change func(*progress) bool) {
	changed, err := p.updateProgress(channelID, userID, change)
	if err != nil {
		p.API.LogError("Failed to store read receipt", "channel_id", channelID, "user_id", userID, "err", err.Error())
		return
	}
	if changed {
		p.API.PublishWebSocketEvent(receiptEvent, map[string]any{"channel_id": channelID}, &model.WebsocketBroadcast{
			ChannelId: channelID,
			OmitUsers: map[string]bool{userID: true},
		})
	}
}

// updateProgress is a compare-and-set loop, since several clients of the same
// user can report at once.
func (p *Plugin) updateProgress(channelID, userID string, change func(*progress) bool) (bool, error) {
	for range kvRetries {
		pr, old, err := p.loadProgress(channelID, userID)
		if err != nil {
			return false, err
		}
		if !change(&pr) {
			return false, nil
		}
		updated, err := json.Marshal(pr)
		if err != nil {
			return false, err
		}
		ok, appErr := p.API.KVCompareAndSet(progressKey(channelID, userID), old, updated)
		if appErr != nil {
			return false, appErr
		}
		if ok {
			return true, nil
		}
	}
	return false, errors.New("progress kept changing while saving it")
}

func main() {
	plugin.ClientMain(&Plugin{})
}
