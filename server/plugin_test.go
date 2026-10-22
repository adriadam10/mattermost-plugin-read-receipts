package main

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
)

func TestIsRecipient(t *testing.T) {
	cases := map[string]struct {
		user *model.User
		want bool
	}{
		"active user":      {&model.User{}, true},
		"bot":              {&model.User{IsBot: true}, false},
		"deactivated user": {&model.User{DeleteAt: 1}, false},
	}
	for name, c := range cases {
		if got := isRecipient(c.user); got != c.want {
			t.Errorf("%s: got %v, want %v", name, got, c.want)
		}
	}
}

func TestPrefCategoryMatchesWebapp(t *testing.T) {
	if got := prefCategory(); got != "pp_com.github.adriadam10.read-re" {
		t.Errorf("category %q", got)
	}
}
