package archive

import (
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDiskArchiverPutWritesGzipped(t *testing.T) {
	dir := t.TempDir()
	d, err := NewDisk(dir)
	if err != nil {
		t.Fatalf("NewDisk: %v", err)
	}

	body := []byte(`{"hello":"world"}`)
	key := Key(time.Unix(1_700_000_000, 0), body)

	if err := d.Put(context.Background(), key, body); err != nil {
		t.Fatalf("Put: %v", err)
	}

	path := filepath.Join(dir, key)
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open archived file: %v", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	defer gz.Close()
	got, err := io.ReadAll(gz)
	if err != nil {
		t.Fatalf("read gz: %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Fatalf("body mismatch: got %q want %q", got, body)
	}
}

func TestDiskArchiverPutIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	d, _ := NewDisk(dir)
	body := []byte("payload")
	key := Key(time.Unix(1_700_000_000, 0), body)

	if err := d.Put(context.Background(), key, body); err != nil {
		t.Fatalf("first Put: %v", err)
	}
	info1, _ := os.Stat(filepath.Join(dir, key))

	// Second Put with the same key must not error and must not rewrite the file.
	if err := d.Put(context.Background(), key, body); err != nil {
		t.Fatalf("second Put: %v", err)
	}
	info2, _ := os.Stat(filepath.Join(dir, key))
	if info1.ModTime() != info2.ModTime() {
		t.Fatalf("idempotent Put rewrote the file (mtime changed)")
	}
}

func TestNewDiskRejectsEmptyRoot(t *testing.T) {
	if _, err := NewDisk(""); err == nil {
		t.Fatal("NewDisk(\"\") should error")
	}
}
