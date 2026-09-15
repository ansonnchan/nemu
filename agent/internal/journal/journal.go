// Package journal provides a single-writer, crash-safe local outbox without a database dependency.
package journal

import (
	"encoding/json"
	"errors"
	"nemu/agent/internal/activity"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

type Batch struct {
	Schema    int                 `json:"schema_version"`
	ID        string              `json:"batch_id"`
	Device    string              `json:"device_id"`
	Intervals []activity.Interval `json:"intervals"`
}
type State struct {
	Registered bool                `json:"registered"`
	Version    int                 `json:"version"`
	Device     string              `json:"device_id"`
	Engine     activity.Engine     `json:"engine"`
	Pending    []activity.Interval `json:"pending"`
	Outbox     *Batch              `json:"outbox,omitempty"`
	LastSync   time.Time           `json:"last_sync"`
	Paused     bool                `json:"paused"`
}
type Store struct {
	Path string
	lock *os.File
}

func Open(dir string) (*Store, State, error) {
	var s State
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, s, err
	}
	f, err := os.OpenFile(filepath.Join(dir, "lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, s, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, s, errors.New("nemu is already running")
	}
	st := &Store{filepath.Join(dir, "journal.json"), f}
	b, err := os.ReadFile(st.Path)
	if errors.Is(err, os.ErrNotExist) {
		s.Version = 1
		s.Device = activity.ID()
		return st, s, nil
	}
	if err == nil {
		err = json.Unmarshal(b, &s)
	}
	if err == nil && (s.Version != 1 || s.Device == "") {
		err = errors.New("unsupported or invalid journal")
	}
	if err != nil {
		st.Close()
		return nil, s, err
	}
	return st, s, nil
}
func (s *Store) Close() { syscall.Flock(int(s.lock.Fd()), syscall.LOCK_UN); s.lock.Close() }
func (s *Store) Save(state State) error {
	b, err := json.Marshal(state)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(s.Path+".tmp", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(b); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(s.Path+".tmp", s.Path); err != nil {
		return err
	}
	d, err := os.Open(filepath.Dir(s.Path))
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}
func (s *State) Queue() *Batch {
	if s.Outbox != nil {
		return s.Outbox
	}
	if len(s.Pending) == 0 {
		return nil
	}
	n := len(s.Pending)
	if n > 90 {
		n = 90
	}
	s.Outbox = &Batch{1, activity.ID(), s.Device, append([]activity.Interval(nil), s.Pending[:n]...)}
	s.Pending = s.Pending[n:]
	return s.Outbox
}
func (s *State) Ack(id string, now time.Time) error {
	if s.Outbox == nil || s.Outbox.ID != id {
		return errors.New("unexpected batch acknowledgment")
	}
	s.Outbox = nil
	s.LastSync = now.UTC()
	return nil
}
