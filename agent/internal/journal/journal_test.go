package journal

import (
	"nemu/agent/internal/activity"
	"os"
	"testing"
	"time"
)

func TestDurabilityAndRetry(t *testing.T) {
	dir := t.TempDir()
	st, s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	s.Pending = []activity.Interval{{ID: "one"}, {ID: "two"}}
	b := s.Queue()
	id := b.ID
	if err = st.Save(s); err != nil {
		t.Fatal(err)
	}
	if _, _, err = Open(dir); err == nil {
		t.Fatal("allowed second writer")
	}
	st.Close()
	st, s, err = Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if s.Queue().ID != id || len(s.Queue().Intervals) != 2 {
		t.Fatal("retry changed batch")
	}
	if s.Ack("wrong", time.Now()) == nil {
		t.Fatal("accepted wrong ack")
	}
	s.Ack(id, time.Now())
	st.Save(s)
	info, _ := os.Stat(st.Path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("journal permissions")
	}
}
func TestCorruptJournalFailsClosed(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(dir+"/journal.json", []byte(`{"version":`), 0600)
	if _, _, err := Open(dir); err == nil {
		t.Fatal("silently discarded corruption")
	}
}
