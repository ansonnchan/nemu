//go:build !darwin || !cgo

// Keep core packages testable elsewhere, but fail explicitly if the desktop process starts without macOS/cgo.
package platform

import (
	"errors"
	"nemu/agent/internal/activity"
)

type Native struct{}

func Init()         { panic("nemu requires macOS and cgo") }
func Pump() int     { return 0 }
func Status(string) {}
func Open(string)   {}
func (Native) Sample() (activity.Sample, error) {
	return activity.Sample{}, errors.New("macOS required")
}
func (Native) Read(string) (string, error) { return "", errors.New("macOS required") }
func (Native) Write(string, string) error  { return errors.New("macOS required") }
