package client

import (
	"context"
	"encoding/json"
	"nemu/agent/internal/journal"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRetryKeepsExactBatch(t *testing.T) {
	var bodies []journal.Batch
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer device:secret" {
			t.Error("missing auth")
		}
		var b journal.Batch
		json.NewDecoder(r.Body).Decode(&b)
		bodies = append(bodies, b)
		if len(bodies) == 1 {
			w.WriteHeader(503)
		} else {
			w.WriteHeader(200)
		}
	}))
	defer server.Close()
	c, err := New(server.URL, "device", "secret")
	if err != nil {
		t.Fatal(err)
	}
	c.HTTP = server.Client()
	b := journal.Batch{Schema: 1, ID: "stable", Device: "device"}
	if c.Post(context.Background(), "/batches", b, nil) == nil {
		t.Fatal("accepted server failure")
	}
	if err = c.Post(context.Background(), "/batches", b, nil); err != nil {
		t.Fatal(err)
	}
	if len(bodies) != 2 || bodies[0].ID != bodies[1].ID {
		t.Fatal("retry changed identity")
	}
}
func TestRejectInsecureOrigin(t *testing.T) {
	for _, v := range []string{"http://example.com", "https://", "https://example.com?secret=x", "https://user:pass@example.com", "https://example.com/path"} {
		if _, err := New(v, "", ""); err == nil {
			t.Fatal("accepted invalid origin")
		}
	}
}
