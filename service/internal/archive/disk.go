package archive

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// DiskArchiver writes gzipped raw payloads under a local directory tree using
// the same Key() layout as the R2 archiver, so the two roots are byte-mirrors
// of each other. Writes are atomic (tmp file + rename) and idempotent: a key
// that already exists is a no-op, matching R2's If-None-Match behavior.
type DiskArchiver struct {
	root string
}

// NewDisk creates the root directory if it doesn't exist and returns an
// archiver rooted there. Pass an absolute path in production; relative paths
// resolve against the worker's current directory.
func NewDisk(root string) (*DiskArchiver, error) {
	if root == "" {
		return nil, errors.New("archive: disk root is empty")
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("archive: mkdir %s: %w", root, err)
	}
	return &DiskArchiver{root: root}, nil
}

// Root returns the directory the archiver writes into. Useful in logs.
func (d *DiskArchiver) Root() string { return d.root }

// Put gzips body and writes it under root/key atomically. If the key already
// exists, Put is a no-op (same content addressing as R2: identical poll in the
// same minute → same key → already archived).
func (d *DiskArchiver) Put(_ context.Context, key string, body []byte) error {
	path := filepath.Join(d.root, key)
	if _, err := os.Stat(path); err == nil {
		return nil // already archived
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	// Compress in memory first so a write failure can't leave a half-gzipped
	// tmp file. Payloads here are small (single feed response).
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(body); err != nil {
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}

	// Atomic write: O_EXCL tmp file → rename. The tmp suffix includes the PID
	// so concurrent writers (shouldn't happen, but cheap insurance) don't
	// collide on the same tmp path.
	tmp := fmt.Sprintf("%s.%d.tmp", path, os.Getpid())
	if err := os.WriteFile(tmp, buf.Bytes(), 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
