// Package platform isolates macOS capabilities from sessionization and transport.
package platform

import "nemu/agent/internal/activity"

type ActivitySource interface {
	Sample() (activity.Sample, error)
}
type SecureStore interface {
	Read(key string) (string, error)
	Write(key, value string) error
}
