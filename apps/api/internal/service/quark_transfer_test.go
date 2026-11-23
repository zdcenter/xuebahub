package service

import (
	"encoding/json"
	"testing"
)

func TestParseAnyUID(t *testing.T) {
	tests := []struct {
		input    interface{}
		expected string
	}{
		{"123456789", "123456789"},
		{"  987654321  ", "987654321"},
		{int64(10086), "10086"},
		{int(200300), "200300"},
		{float64(300400), "300400"},
		{json.Number("400500"), "400500"},
		{"a1b2c3d4", ""}, // 字母数字哈希，非达人UID，应过滤为空
		{"b-user-id-xyz", ""},
		{"", ""},
		{nil, ""},
	}

	for _, tt := range tests {
		got := parseAnyUID(tt.input)
		if got != tt.expected {
			t.Errorf("parseAnyUID(%v) = %q, expected %q", tt.input, got, tt.expected)
		}
	}
}
