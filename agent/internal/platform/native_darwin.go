//go:build darwin && cgo

package platform

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework ApplicationServices -framework Security
#include "native_darwin.h"
*/
import "C"
import (
	"encoding/json"
	"errors"
	"fmt"
	"nemu/agent/internal/activity"
	"time"
	"unsafe"
)

type Native struct{}

func Init()           { C.nemu_init() }
func Pump() int       { return int(C.nemu_pump()) }
func Status(s string) { c := C.CString(s); defer C.free(unsafe.Pointer(c)); C.nemu_status(c) }
func Open(s string)   { c := C.CString(s); defer C.free(unsafe.Pointer(c)); C.nemu_open(c) }
func (Native) Sample() (activity.Sample, error) {
	p := C.nemu_sample()
	if p == nil {
		return activity.Sample{}, errors.New("foreground unavailable")
	}
	defer C.free(unsafe.Pointer(p))
	var v struct {
		activity.App
		Idle float64 `json:"idle"`
	}
	if err := json.Unmarshal([]byte(C.GoString(p)), &v); err != nil {
		return activity.Sample{}, err
	}
	return activity.Sample{At: time.Now().UTC(), App: v.App, Idle: time.Duration(v.Idle * float64(time.Second))}, nil
}
func (Native) Read(key string) (string, error) {
	k := C.CString(key)
	defer C.free(unsafe.Pointer(k))
	p := C.nemu_secret_read(k)
	if p == nil {
		return "", errors.New("credential unavailable")
	}
	defer C.free(unsafe.Pointer(p))
	return C.GoString(p), nil
}
func (Native) Write(key, value string) error {
	k := C.CString(key)
	v := C.CString(value)
	defer C.free(unsafe.Pointer(k))
	defer C.free(unsafe.Pointer(v))
	if s := C.nemu_secret_write(k, v); s != 0 {
		return fmt.Errorf("Keychain status %d", int(s))
	}
	return nil
}
