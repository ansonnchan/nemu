package activity

import (
	"encoding/json"
	"testing"
	"time"
)

var origin = time.Date(2026, 3, 8, 7, 55, 0, 0, time.UTC)

func sample(e *Engine, t *testing.T, seconds int, app string, idle int) {
	t.Helper()
	if err := e.Observe(Sample{origin.Add(time.Duration(seconds) * time.Second), App{app, app}, time.Duration(idle) * time.Second}); err != nil {
		t.Fatal(err)
	}
}
func TestTransitions(t *testing.T) {
	e := Engine{}
	sample(&e, t, 0, "A", 0)
	sample(&e, t, 360, "B", 0)
	sample(&e, t, 361, "A", 0)
	e.Stop(origin.Add(420*time.Second), "shutdown")
	v := e.Seal(origin.Add(time.Hour), true)
	if len(v) != 3 || v[1].End.Sub(v[1].Start) != time.Second || v[0].Reason != "app_switch" {
		t.Fatalf("brief transitions lost: %+v", v)
	}
}
func TestRetroactiveIdleAcrossSwitches(t *testing.T) {
	e := Engine{}
	sample(&e, t, 0, "A", 0)
	sample(&e, t, 100, "B", 40)
	sample(&e, t, 359, "B", 299)
	if e.Current.Kind != "app" {
		t.Fatal("early idle")
	}
	sample(&e, t, 360, "B", 300)
	if len(e.Tail) != 1 || !e.Tail[0].End.Equal(origin.Add(time.Minute)) || e.Current.Kind != "idle" {
		t.Fatalf("bad rollback: %+v", e)
	}
	sample(&e, t, 500, "C", 0)
	if e.Current.Bundle != "C" || e.Tail[1].Kind != "idle" {
		t.Fatal("bad resume")
	}
}
func TestSleepAndRecovery(t *testing.T) {
	e := Engine{}
	sample(&e, t, 0, "A", 0)
	sample(&e, t, 60, "A", 0)
	b, _ := json.Marshal(e)
	var restored Engine
	json.Unmarshal(b, &restored)
	restored.Recover()
	sample(&restored, t, 3600, "B", 0)
	if restored.Tail[0].End.Sub(restored.Tail[0].Start) != time.Minute {
		t.Fatal("counted downtime")
	}
	restored.Stop(origin.Add(3660*time.Second), "sleep")
	sample(&restored, t, 7200, "C", 0)
	if restored.Current.Start != origin.Add(7200*time.Second) {
		t.Fatal("sleep counted")
	}
}
func TestSealingPreservesIdleBoundary(t *testing.T) {
	e := Engine{}
	sample(&e, t, 0, "A", 0)
	sample(&e, t, 600, "A", 0)
	v := e.Seal(origin.Add(600*time.Second), false)
	if len(v) != 1 || v[0].End != origin.Add(300*time.Second) {
		t.Fatal("unsafe seal")
	}
	sample(&e, t, 900, "A", 300)
	if e.Current.Start != origin.Add(600*time.Second) {
		t.Fatal("idle boundary")
	}
	if e.Tail[0].SessionID != v[0].SessionID {
		t.Fatal("lost logical session")
	}
}
func TestMidnightAndInvalidTime(t *testing.T) {
	e := Engine{}
	at := time.Date(2026, 1, 1, 23, 59, 0, 0, time.UTC)
	e.Observe(Sample{at, App{"A", "a"}, 0})
	e.Observe(Sample{at.Add(2 * time.Minute), App{"A", "a"}, 0})
	if e.Current.Start != at {
		t.Fatal("midnight destroyed session")
	}
	if e.Observe(Sample{at, App{"A", "a"}, 0}) == nil {
		t.Fatal("accepted time reversal")
	}
	if e.Observe(Sample{}) == nil {
		t.Fatal("accepted zero timestamp")
	}
}
