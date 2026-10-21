package main

import "testing"

func TestAdvanceOnlyMovesForward(t *testing.T) {
	marks, changed := advance(nil, 100, 1)
	if !changed || len(marks) != 1 {
		t.Fatalf("first mark not added: %v", marks)
	}
	if _, changed = advance(marks, 100, 2); changed {
		t.Fatal("same watermark must not add a mark")
	}
	if _, changed = advance(marks, 50, 2); changed {
		t.Fatal("older watermark must not add a mark")
	}
}

func TestAdvanceKeepsTheNewestMarks(t *testing.T) {
	var marks []mark
	for i := int64(1); i <= maxMarks+10; i++ {
		marks, _ = advance(marks, i, i)
	}
	if len(marks) != maxMarks || marks[0][0] != 11 {
		t.Fatalf("got %d marks starting at %d", len(marks), marks[0][0])
	}
}

func TestReachedAt(t *testing.T) {
	marks := []mark{{100, 110}, {200, 250}}
	cases := map[int64]int64{50: 110, 100: 110, 150: 250, 200: 250, 201: 0}
	for post, want := range cases {
		if got := reachedAt(marks, post); got != want {
			t.Errorf("reachedAt(%d) = %d, want %d", post, got, want)
		}
	}
}

func TestMarkReadAlsoDelivers(t *testing.T) {
	var pr progress
	if !pr.markRead(100, 110) {
		t.Fatal("markRead reported no change")
	}
	if reachedAt(pr.Delivered, 100) != 110 {
		t.Fatal("read post not marked delivered")
	}
}

func TestPostState(t *testing.T) {
	read := progress{Delivered: []mark{{100, 1}}, Read: []mark{{100, 2}}}
	delivered := progress{Delivered: []mark{{100, 1}}}
	cases := []struct {
		name       string
		recipients []progress
		hideRead   bool
		want       receiptState
	}{
		{"nobody got it", []progress{{}}, false, stateSent},
		{"one of two got it", []progress{delivered, {}}, false, stateSent},
		{"all got it", []progress{delivered, read}, false, stateDelivered},
		{"all read it", []progress{read, read}, false, stateRead},
		{"read but hidden", []progress{read}, true, stateDelivered},
	}
	for _, c := range cases {
		if got := postState(100, c.recipients, c.hideRead); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}
