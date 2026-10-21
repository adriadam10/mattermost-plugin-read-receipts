package main

import "testing"

func TestMaxChannelMembers(t *testing.T) {
	cases := []struct {
		value any
		want  int
		ok    bool
	}{
		{nil, defaultMaxChannelMembers, true},
		{float64(10), 10, true},
		{"0", 0, true},
		{"abc", 0, false},
		{float64(-1), 0, false},
		{float64(maxChannelMembersCap + 1), 0, false},
	}
	for _, c := range cases {
		got, err := configuration{MaxChannelMembers: c.value}.maxChannelMembers()
		if (err == nil) != c.ok || (c.ok && got != c.want) {
			t.Errorf("%v: got %d, %v", c.value, got, err)
		}
	}
}
