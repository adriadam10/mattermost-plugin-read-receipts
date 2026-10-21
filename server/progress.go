package main

// Each member of a conversation has two watermarks: how far messages have been
// delivered to one of their clients and how far they have read. Messages arrive
// in order, so "post X is read" is "the read watermark reached X.CreateAt". A
// watermark is kept as the list of its advances so the info panel can tell when
// each post was reached, not only whether it was.

// maxMarks bounds the history kept per member and conversation. Older posts
// still show as delivered/read, but their time becomes that of the oldest kept mark.
const maxMarks = 500

// mark is one advance of a watermark: [upto, at], both in epoch milliseconds.
type mark [2]int64

type progress struct {
	Delivered []mark `json:"d,omitempty"`
	Read      []mark `json:"r,omitempty"`
}

// advance appends a mark if it moves the watermark forward.
func advance(marks []mark, upto, at int64) ([]mark, bool) {
	if n := len(marks); n > 0 && marks[n-1][0] >= upto {
		return marks, false
	}
	marks = append(marks, mark{upto, at})
	if len(marks) > maxMarks {
		marks = marks[len(marks)-maxMarks:]
	}
	return marks, true
}

// reachedAt returns when the watermark first reached t, or 0 if it has not.
func reachedAt(marks []mark, t int64) int64 {
	for _, m := range marks {
		if m[0] >= t {
			return m[1]
		}
	}
	return 0
}

func (pr *progress) markDelivered(upto, at int64) bool {
	var changed bool
	pr.Delivered, changed = advance(pr.Delivered, upto, at)
	return changed
}

// markRead also marks the same posts delivered: a read message was obviously received.
func (pr *progress) markRead(upto, at int64) bool {
	deliveredChanged := pr.markDelivered(upto, at)
	var readChanged bool
	pr.Read, readChanged = advance(pr.Read, upto, at)
	return readChanged || deliveredChanged
}

type receiptState string

const (
	stateSent      receiptState = "sent"
	stateDelivered receiptState = "delivered"
	stateRead      receiptState = "read"
)

// postState is the WhatsApp rule: blue once every recipient has read the post,
// grey double check once it reached all of them, single check otherwise.
func postState(createAt int64, recipients []progress, hideRead bool) receiptState {
	allRead, allDelivered := !hideRead, true
	for _, pr := range recipients {
		if reachedAt(pr.Read, createAt) == 0 {
			allRead = false
		}
		if reachedAt(pr.Delivered, createAt) == 0 {
			allDelivered = false
		}
	}
	switch {
	case allRead:
		return stateRead
	case allDelivered:
		return stateDelivered
	default:
		return stateSent
	}
}
