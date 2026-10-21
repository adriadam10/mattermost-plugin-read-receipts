package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
)

// The plugin id, also used as the preference category of the user setting.
const manifestID = "com.github.adriadam10.read-receipts"

// One request covers at most a screenful of posts or the user's recent conversations.
const maxIDsPerRequest = 200

func (p *Plugin) newRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/delivered", p.handleDelivered)
	mux.HandleFunc("POST /api/v1/read", p.handleRead)
	mux.HandleFunc("POST /api/v1/status", p.handleStatus)
	mux.HandleFunc("GET /api/v1/info/{post_id}", p.handleInfo)
	return requireUser(mux)
}

func requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-Id") == "" {
			http.Error(w, "not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type idsRequest struct {
	ChannelIDs []string `json:"channel_ids"`
	PostIDs    []string `json:"post_ids"`
}

func decodeIDs(w http.ResponseWriter, r *http.Request) (*idsRequest, bool) {
	var req idsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return nil, false
	}
	if len(req.ChannelIDs) > maxIDsPerRequest || len(req.PostIDs) > maxIDsPerRequest {
		http.Error(w, "too many ids", http.StatusBadRequest)
		return nil, false
	}
	return &req, true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// handleDelivered: a client of the user is up and has every message posted until now.
func (p *Plugin) handleDelivered(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	req, ok := decodeIDs(w, r)
	if !ok {
		return
	}
	now := model.GetMillis()
	ignored := []string{}
	for _, channelID := range req.ChannelIDs {
		if _, err := p.conversation(channelID, userID); err != nil {
			ignored = appendIfUntracked(ignored, channelID, err)
			continue
		}
		p.record(channelID, userID, func(pr *progress) bool { return pr.markDelivered(now, now) })
	}
	writeJSON(w, map[string]any{"ignored_channel_ids": ignored})
}

// appendIfUntracked lists channels without read receipts, so the client stops
// reporting them. Other errors are transient and the channel is not listed.
func appendIfUntracked(ignored []string, channelID string, err error) []string {
	if errors.Is(err, errNotConversation) {
		return append(ignored, channelID)
	}
	return ignored
}

// handleRead: these posts were on the user's screen with the window focused.
func (p *Plugin) handleRead(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	req, ok := decodeIDs(w, r)
	if !ok {
		return
	}
	latest := map[string]int64{}
	for _, postID := range req.PostIDs {
		post, appErr := p.API.GetPost(postID)
		if appErr != nil || post.UserId == userID || post.DeleteAt != 0 {
			continue
		}
		latest[post.ChannelId] = max(latest[post.ChannelId], post.CreateAt)
	}
	now := model.GetMillis()
	optedOut := p.readReceiptsOff(userID)
	ignored := []string{}
	for channelID, upto := range latest {
		conv, err := p.conversation(channelID, userID)
		if err != nil {
			ignored = appendIfUntracked(ignored, channelID, err)
			continue
		}
		if optedOut && p.isDirect(conv) {
			p.record(channelID, userID, func(pr *progress) bool { return pr.markDelivered(upto, now) })
			continue
		}
		p.record(channelID, userID, func(pr *progress) bool { return pr.markRead(upto, now) })
	}
	writeJSON(w, map[string]any{"ignored_channel_ids": ignored})
}

// conversationView is what the author of a post may know about its recipients.
type conversationView struct {
	recipients []string
	progress   []progress
	hideRead   bool
}

func (p *Plugin) viewFor(channelID, authorID string) (*conversationView, error) {
	conv, err := p.conversation(channelID, authorID)
	if err != nil {
		return nil, err
	}
	view := &conversationView{recipients: conv.recipients}
	direct := p.isDirect(conv)
	view.hideRead = direct && p.readReceiptsOff(authorID)
	for _, userID := range conv.recipients {
		pr, _, err := p.loadProgress(channelID, userID)
		if err != nil {
			return nil, err
		}
		view.progress = append(view.progress, pr)
		if direct && p.readReceiptsOff(userID) {
			view.hideRead = true
		}
	}
	return view, nil
}

// handleStatus returns the check marks of the requester's own posts; posts by
// anybody else are left out, so only the author ever learns who read a message.
func (p *Plugin) handleStatus(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	req, ok := decodeIDs(w, r)
	if !ok {
		return
	}
	views := map[string]*conversationView{}
	statuses := map[string]receiptState{}
	for _, postID := range req.PostIDs {
		post, appErr := p.API.GetPost(postID)
		if appErr != nil || post.UserId != userID {
			continue
		}
		view, seen := views[post.ChannelId]
		if !seen {
			var err error
			if view, err = p.viewFor(post.ChannelId, userID); err != nil && !errors.Is(err, errNotConversation) {
				p.API.LogWarn("Failed to load read receipts", "channel_id", post.ChannelId, "err", err.Error())
			}
			views[post.ChannelId] = view
		}
		if view == nil || len(view.recipients) == 0 {
			continue
		}
		statuses[postID] = postState(post.CreateAt, view.progress, view.hideRead)
	}
	writeJSON(w, map[string]any{"statuses": statuses})
}

type recipientInfo struct {
	UserID      string `json:"user_id"`
	DeliveredAt int64  `json:"delivered_at"`
	ReadAt      int64  `json:"read_at"`
}

// handleInfo is the per-member detail of one of the requester's own posts.
func (p *Plugin) handleInfo(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	post, appErr := p.API.GetPost(r.PathValue("post_id"))
	if appErr != nil || post.UserId != userID {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	view, err := p.viewFor(post.ChannelId, userID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	recipients := make([]recipientInfo, 0, len(view.recipients))
	for i, recipientID := range view.recipients {
		info := recipientInfo{
			UserID:      recipientID,
			DeliveredAt: reachedAt(view.progress[i].Delivered, post.CreateAt),
		}
		if !view.hideRead {
			info.ReadAt = reachedAt(view.progress[i].Read, post.CreateAt)
		}
		recipients = append(recipients, info)
	}
	writeJSON(w, map[string]any{"recipients": recipients, "read_hidden": view.hideRead})
}
