// Package platform isolates macOS capabilities from sessionization and transport.
package platform

import "nemu/agent/internal/activity"
import "errors"

var ErrCredentialNotFound = errors.New("credential not found")

type ActivitySource interface {
	Sample() (activity.Sample, error)
}
type SecureStore interface {
	Read(key string) (string, error)
	Write(key, value string) error
}
