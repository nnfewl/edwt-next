package archive

import (
	"strings"
	"testing"
	"time"
)

func TestKeyIdempotentWithinMinute(t *testing.T) {
	body := []byte(`[{"id":"a"}]`)
	t1 := time.Date(2026, 5, 27, 15, 33, 10, 0, time.UTC)
	t2 := time.Date(2026, 5, 27, 15, 33, 59, 0, time.UTC) // same minute, different second
	if Key(t1, body) != Key(t2, body) {
		t.Fatal("same minute + identical body must produce the same key")
	}
}

func TestKeyDiffersByContent(t *testing.T) {
	tm := time.Date(2026, 5, 27, 15, 33, 0, 0, time.UTC)
	if Key(tm, []byte("aaa")) == Key(tm, []byte("bbb")) {
		t.Fatal("different content must produce different keys")
	}
}

func TestKeyDiffersByMinute(t *testing.T) {
	body := []byte("x")
	a := Key(time.Date(2026, 5, 27, 15, 33, 0, 0, time.UTC), body)
	b := Key(time.Date(2026, 5, 27, 15, 34, 0, 0, time.UTC), body)
	if a == b {
		t.Fatal("different minute must produce different keys")
	}
}

func TestKeyShape(t *testing.T) {
	k := Key(time.Date(2026, 5, 27, 15, 33, 0, 0, time.UTC), []byte("x"))
	if !strings.HasPrefix(k, "raw/2026/05/27/15/33-") || !strings.HasSuffix(k, ".json.gz") {
		t.Fatalf("unexpected key shape: %q", k)
	}
}
