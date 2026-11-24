package service

import (
	"encoding/json"
	"testing"
)

func TestParseAccountInfoJson(t *testing.T) {
	rawJSON := `{"success":true,"data":{"nickname":"满心欢喜的向日葵","avatarUri":"http://image.quark.cn/avatar.jpg","mobilekps":"xxx","config":{}},"code":"OK"}`

	var infoRes struct {
		Success bool                   `json:"success"`
		Code    interface{}            `json:"code"`
		Data    map[string]interface{} `json:"data"`
	}
	err := json.Unmarshal([]byte(rawJSON), &infoRes)
	if err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	nick, _ := infoRes.Data["nickname"].(string)
	if nick != "满心欢喜的向日葵" {
		t.Fatalf("Expected '满心欢喜的向日葵', got %q", nick)
	}
}

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
		{"a1b2c3d4", ""},
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
