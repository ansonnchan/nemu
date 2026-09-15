package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"nemu/agent/internal/activity"
	"nemu/agent/internal/client"
	"nemu/agent/internal/journal"
	"nemu/agent/internal/platform"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

type result struct {
	kind, id, url string
	err           error
}

func main() {
	runtime.LockOSThread()
	base := flag.String("url", os.Getenv("NEMU_URL"), "hosted nemu HTTPS origin")
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	dir := flag.String("data", filepath.Join(home, "Library", "Application Support", "nemu"), "local journal directory")
	flag.Parse()
	store, state, err := journal.Open(*dir)
	if err != nil {
		slog.Error("journal unavailable")
		os.Exit(1)
	}
	defer store.Close()
	save := func() {
		if err := store.Save(state); err != nil {
			slog.Error("journal persistence failed; recording stopped")
			os.Exit(1)
		}
	}
	state.Engine.Recover()
	state.Pending = append(state.Pending, state.Engine.Seal(state.Engine.Last, true)...)
	save()
	native := platform.Native{}
	secret, err := native.Read(state.Device)
	if err != nil {
		secret = activity.ID() + activity.ID()
		if err = native.Write(state.Device, secret); err != nil {
			slog.Error("Keychain unavailable")
			os.Exit(1)
		}
	}
	api, err := client.New(*base, state.Device, secret)
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	platform.Init()
	slog.Info("agent started")
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	results := make(chan result, 2)
	busy := false
	registered := false
	pairNext := !state.Registered
	register := func() {
		busy = true
		go func() {
			err := api.Post(context.Background(), "/devices", map[string]string{"device_id": state.Device, "secret": secret}, nil)
			results <- result{kind: "register", err: err}
		}()
	}
	register()
	nextUpload := time.Now().Add(time.Hour)
	nextSample := time.Now()
	sleeping := false
	retry := time.Minute
	nextRetry := time.Time{}
	upload := func() {
		if busy || !registered {
			return
		}
		state.Pending = append(state.Pending, state.Engine.Seal(time.Now().UTC(), false)...)
		b := state.Queue()
		save()
		if b == nil {
			return
		}
		copyBatch := *b
		busy = true
		go func() {
			err := api.Post(context.Background(), "/batches", copyBatch, nil)
			results <- result{kind: "upload", id: copyBatch.ID, err: err}
		}()
	}
	pairing := func() {
		if busy || !registered {
			pairNext = true
			return
		}
		busy = true
		go func() {
			var v struct {
				Token string `json:"token"`
			}
			err := api.Post(context.Background(), "/pairing", struct{}{}, &v)
			results <- result{kind: "pair", url: api.Base + "/#pair=" + v.Token, err: err}
		}()
	}
	quit := func() {
		state.Engine.Stop(time.Now().UTC(), "shutdown")
		state.Pending = append(state.Pending, state.Engine.Seal(time.Now().UTC(), true)...)
		save()
	}
	for {
		select {
		case <-stop:
			quit()
			return
		case r := <-results:
			busy = false
			if r.err != nil {
				slog.Warn("request failed; local data retained", "operation", r.kind)
				nextRetry = time.Now().Add(retry)
				retry *= 2
				if retry > time.Hour {
					retry = time.Hour
				}
				platform.Status("○ offline · data saved locally")
			} else {
				retry = time.Minute
				nextRetry = time.Time{}
				switch r.kind {
				case "register":
					registered = true
					state.Registered = true
					save()
				case "upload":
					if err := state.Ack(r.id, time.Now()); err != nil {
						panic(err)
					}
					save()
					upload()
				case "pair":
					platform.Open(r.url)
				}
			}
			if pairNext && registered && !busy {
				pairNext = false
				pairing()
			}
		default:
		}
		cmd := platform.Pump()
		now := time.Now().UTC()
		switch cmd {
		case 1:
			platform.Open(api.Base)
		case 2:
			upload()
		case 3:
			state.Paused = !state.Paused
			if state.Paused {
				state.Engine.Stop(now, "pause")
			}
			save()
		case 4:
			pairing()
		case 5:
			quit()
			return
		case 10:
			sleeping = true
			state.Engine.Stop(now, "sleep")
			save()
		case 11:
			sleeping = false
		}
		if !now.Before(nextSample) {
			if !state.Paused && !sleeping {
				sample, e := native.Sample()
				if e == nil {
					// A runloop gap is unobserved time, even if a power notification was missed.
					if !state.Engine.Last.IsZero() && sample.At.Sub(state.Engine.Last) > 10*time.Second {
						state.Engine.Recover()
					}
					if e = state.Engine.Observe(sample); e != nil {
						slog.Warn("observation rejected")
					}
					save()
				} else {
					state.Engine.Recover()
					save()
				}
			}
			label := "● recording"
			if state.Paused {
				label = "○ paused"
			}
			if sleeping {
				label = "○ sleeping"
			}
			sync := "not synced yet"
			if !state.LastSync.IsZero() {
				sync = fmt.Sprintf("synced %dm ago", int(time.Since(state.LastSync).Minutes()))
			}
			platform.Status(label + " · " + sync)
			nextSample = now.Add(time.Second)
		}
		if !now.Before(nextUpload) {
			upload()
			nextUpload = now.Add(time.Hour)
		}
		if !nextRetry.IsZero() && !now.Before(nextRetry) && !busy {
			nextRetry = time.Time{}
			if !registered {
				register()
			} else {
				upload()
			}
		}
		time.Sleep(40 * time.Millisecond)
	}
}
