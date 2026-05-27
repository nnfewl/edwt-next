package edwt

import "testing"

const fixture = `[
  {"id":"a","name":"Alpha","slug":"AL","waitTime":{"id":"r1","reportId":"rep1","waitTimeMinutes":42,"elosMinutes":100,"status":"normal","createdAt":"2026-05-26T05:54:33.657Z"}},
  {"id":"b","name":"Bravo","waitTime":null},
  {"name":"NoID"},
  {"id":"c","extraUnknownField":true}
]`

func TestDecode(t *testing.T) {
	items, err := Decode([]byte(fixture))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 { // the id-less item is dropped
		t.Fatalf("want 3 id-bearing items, got %d", len(items))
	}
	if items[0].ID != "a" || items[0].Name != "Alpha" {
		t.Fatalf("bad first item: %+v", items[0])
	}
	if items[0].WaitTime == nil || items[0].WaitTime.ReportID != "rep1" {
		t.Fatalf("waitTime not parsed: %+v", items[0].WaitTime)
	}
	if wt := items[0].WaitTime.WaitTimeMinutes; wt == nil || *wt != 42 {
		t.Fatalf("wait minutes mismatch")
	}
	if items[1].WaitTime != nil {
		t.Fatalf("expected nil waitTime for b")
	}
	if len(items[0].Raw) == 0 {
		t.Fatalf("raw bytes not preserved")
	}
}

func TestDecodeNotArray(t *testing.T) {
	if _, err := Decode([]byte(`{"oops":true}`)); err == nil {
		t.Fatal("expected error for non-array body")
	}
}
