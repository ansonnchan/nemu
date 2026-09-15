// Package activity turns foreground observations into factual, non-overlapping intervals.
package activity

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

const IdleThreshold = 5 * time.Minute

type App struct {
	Name   string `json:"app_name"`
	Bundle string `json:"bundle_id"`
}
type Interval struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	Kind      string `json:"kind"`
	App
	Start  time.Time `json:"started_at"`
	End    time.Time `json:"ended_at"`
	Reason string    `json:"end_reason"`
}
type Sample struct {
	At   time.Time
	App  App
	Idle time.Duration
}
type Engine struct {
	Current *Interval  `json:"current,omitempty"`
	Tail    []Interval `json:"tail"`
	Last    time.Time  `json:"last"`
	Since   time.Time  `json:"since"`
}

func ID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func (e *Engine) begin(at time.Time, kind string, app App) {
	e.Current = &Interval{ID: ID(), SessionID: ID(), Kind: kind, App: app, Start: at.UTC()}
}
func (e *Engine) close(at time.Time, reason string) {
	if e.Current != nil && at.After(e.Current.Start) {
		v := *e.Current
		v.End = at.UTC()
		v.Reason = reason
		e.Tail = append(e.Tail, v)
	}
	e.Current = nil
}
func (e *Engine) Observe(s Sample) error {
	if s.At.IsZero() || s.Idle < 0 || (!e.Last.IsZero() && s.At.Before(e.Last)) {
		return errors.New("invalid observation time")
	}
	if s.App.Name == "" || s.App.Bundle == "" {
		return errors.New("missing application identity")
	}
	s.At = s.At.UTC()
	if e.Current == nil {
		e.Since = s.At
		e.begin(s.At, "app", s.App)
	}
	if s.Idle >= IdleThreshold {
		if e.Current.Kind != "idle" {
			boundary := s.At.Add(-s.Idle)
			if boundary.Before(e.Since) {
				boundary = e.Since
			}
			// The last five minutes remain mutable: erase speculative app transitions after last input.
			kept := e.Tail[:0]
			for _, v := range e.Tail {
				if !v.Start.Before(boundary) {
					continue
				}
				if v.End.After(boundary) {
					v.End = boundary
					v.Reason = "idle"
				}
				kept = append(kept, v)
			}
			e.Tail = kept
			e.close(boundary, "idle")
			e.begin(boundary, "idle", App{})
		}
	} else if e.Current.Kind == "idle" {
		e.close(s.At, "resume")
		e.begin(s.At, "app", s.App)
	} else if e.Current.Bundle != s.App.Bundle {
		e.close(s.At, "app_switch")
		e.begin(s.At, "app", s.App)
	}
	e.Last = s.At
	return nil
}

// Stop excludes sleep, pause and unobserved downtime from both active and idle usage.
func (e *Engine) Stop(at time.Time, reason string) {
	e.close(at, reason)
	e.Last = at.UTC()
	e.Since = time.Time{}
}

// Recover closes only through the last durable observation, never through restart time.
func (e *Engine) Recover() {
	if !e.Last.IsZero() {
		e.Stop(e.Last, "restart")
	}
}

// Seal moves only settled time to the immutable upload queue. Fragments retain a logical session ID.
func (e *Engine) Seal(now time.Time, all bool) []Interval {
	cut := now.Add(-IdleThreshold)
	if all {
		cut = now
	}
	out := []Interval{}
	keep := []Interval{}
	for _, v := range e.Tail {
		if !v.End.After(cut) {
			out = append(out, v)
		} else if v.Start.Before(cut) {
			part := v
			part.End = cut
			part.Reason = "checkpoint"
			out = append(out, part)
			v.Start = cut
			v.ID = ID()
			keep = append(keep, v)
		} else {
			keep = append(keep, v)
		}
	}
	e.Tail = keep
	if e.Current != nil && e.Current.Start.Before(cut) {
		v := *e.Current
		v.End = cut
		v.Reason = "checkpoint"
		out = append(out, v)
		e.Current.Start = cut
		e.Current.ID = ID()
	}
	if e.Since.Before(cut) {
		e.Since = cut
	}
	// Bound each wire interval to 24h without changing logical session identity.
	split := []Interval{}
	for _, v := range out {
		for v.End.Sub(v.Start) > 24*time.Hour {
			p := v
			p.End = p.Start.Add(24 * time.Hour)
			p.Reason = "checkpoint"
			split = append(split, p)
			v.Start = p.End
			v.ID = ID()
		}
		split = append(split, v)
	}
	return split
}
