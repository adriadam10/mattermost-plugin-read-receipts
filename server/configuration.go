package main

import (
	"fmt"
	"strconv"
	"sync/atomic"
)

const (
	defaultMaxChannelMembers = 25
	// Keeps every check within one page of channel members.
	maxChannelMembersCap = 100
)

// configuration mirrors settings_schema in plugin.json. The System Console can
// store a number setting as a JSON number or as a string, so it is decoded loosely.
type configuration struct {
	MaxChannelMembers any
}

func (c configuration) maxChannelMembers() (int, error) {
	var n int
	switch v := c.MaxChannelMembers.(type) {
	case nil:
		return defaultMaxChannelMembers, nil
	case float64:
		n = int(v)
	case string:
		parsed, err := strconv.Atoi(v)
		if err != nil {
			return 0, fmt.Errorf("MaxChannelMembers must be a whole number, got %q", v)
		}
		n = parsed
	default:
		return 0, fmt.Errorf("MaxChannelMembers has an unexpected type %T", v)
	}
	if n < 0 || n > maxChannelMembersCap {
		return 0, fmt.Errorf("MaxChannelMembers must be between 0 and %d, got %d", maxChannelMembersCap, n)
	}
	return n, nil
}

type settings struct {
	maxChannelMembers atomic.Int64
}

func (p *Plugin) OnConfigurationChange() error {
	var c configuration
	if err := p.API.LoadPluginConfiguration(&c); err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	n, err := c.maxChannelMembers()
	if err != nil {
		return err
	}
	p.settings.maxChannelMembers.Store(int64(n))
	return nil
}
