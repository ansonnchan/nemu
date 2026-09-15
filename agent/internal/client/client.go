package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	Base, Device, Secret string
	HTTP                 *http.Client
}

func New(base, device, secret string) (*Client, error) {
	u, err := url.Parse(base)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("NEMU_URL must be an HTTPS origin")
	}
	return &Client{strings.TrimRight(base, "/"), device, secret, &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (c *Client) Post(ctx context.Context, path string, payload, result any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	r, err := http.NewRequestWithContext(ctx, "POST", c.Base+"/api"+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+c.Device+":"+c.Secret)
	resp, err := c.HTTP.Do(r)
	if err != nil {
		return fmt.Errorf("network request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("server returned status %d", resp.StatusCode)
	}
	if result != nil {
		return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(result)
	}
	return nil
}
