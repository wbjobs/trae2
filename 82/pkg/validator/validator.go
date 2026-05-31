package validator

import (
	"errors"
	"hash/crc32"
)

const (
	CRC16Polynomial = 0xA001
	CRC16InitValue  = 0xFFFF
)

type Validator struct {
	config *ValidatorConfig
}

type ValidatorConfig struct {
	EnableCRC16   bool `mapstructure:"enable_crc16"`
	EnableCRC32   bool `mapstructure:"enable_crc32"`
	EnableChecksum bool `mapstructure:"enable_checksum"`
	EnableLengthCheck bool `mapstructure:"enable_length_check"`
	MinPacketLen  int  `mapstructure:"min_packet_len"`
	MaxPacketLen  int  `mapstructure:"max_packet_len"`
}

type ValidationResult struct {
	IsValid bool
	Errors  []error
}

func NewValidator(config *ValidatorConfig) *Validator {
	return &Validator{
		config: config,
	}
}

func (v *Validator) Validate(data []byte) *ValidationResult {
	result := &ValidationResult{
		IsValid: true,
		Errors:  make([]error, 0),
	}

	if v.config.EnableLengthCheck {
		if err := v.validateLength(data); err != nil {
			result.IsValid = false
			result.Errors = append(result.Errors, err)
		}
	}

	return result
}

func (v *Validator) validateLength(data []byte) error {
	if len(data) < v.config.MinPacketLen {
		return errors.New("packet length too short")
	}
	if len(data) > v.config.MaxPacketLen {
		return errors.New("packet length too long")
	}
	return nil
}

func CRC16(data []byte) uint16 {
	crc := uint16(CRC16InitValue)
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if (crc & 0x0001) != 0 {
				crc = (crc >> 1) ^ CRC16Polynomial
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}

func CRC16Check(data []byte, expected uint16) bool {
	return CRC16(data) == expected
}

func CRC32(data []byte) uint32 {
	return crc32.ChecksumIEEE(data)
}

func CRC32Check(data []byte, expected uint32) bool {
	return CRC32(data) == expected
}

func Checksum8(data []byte) byte {
	var sum byte
	for _, b := range data {
		sum += b
	}
	return sum
}

func Checksum8Check(data []byte, expected byte) bool {
	return Checksum8(data) == expected
}

func LRC(data []byte) byte {
	var lrc byte
	for _, b := range data {
		lrc += b
	}
	return ((lrc ^ 0xFF) + 1)
}

func LRCCheck(data []byte, expected byte) bool {
	return LRC(data) == expected
}

func XORChecksum(data []byte) byte {
	var xor byte
	for _, b := range data {
		xor ^= b
	}
	return xor
}

func XORChecksumCheck(data []byte, expected byte) bool {
	return XORChecksum(data) == expected
}

type ProtocolValidator interface {
	ValidateHeader(data []byte) bool
	ValidateLength(data []byte) bool
	ValidateChecksum(data []byte) bool
	ValidateAll(data []byte) *ValidationResult
}

type TCPProtocolValidator struct {
	minLen int
	maxLen int
}

func NewTCPProtocolValidator(minLen, maxLen int) *TCPProtocolValidator {
	return &TCPProtocolValidator{
		minLen: minLen,
		maxLen: maxLen,
	}
}

func (tv *TCPProtocolValidator) ValidateHeader(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	return data[0] == 0x5A && data[1] == 0x5A && data[2] == 0x5A && data[3] == 0x5A
}

func (tv *TCPProtocolValidator) ValidateLength(data []byte) bool {
	if len(data) < 15 {
		return false
	}
	length := uint32(data[11])<<24 | uint32(data[12])<<16 | uint32(data[13])<<8 | uint32(data[14])
	return len(data) >= int(15+length+4)
}

func (tv *TCPProtocolValidator) ValidateChecksum(data []byte) bool {
	if len(data) < 15 {
		return false
	}
	length := uint32(data[11])<<24 | uint32(data[12])<<16 | uint32(data[13])<<8 | uint32(data[14])
	if len(data) < int(15+length+4) {
		return false
	}
	receivedCRC := uint32(data[15+length])<<24 | uint32(data[15+length+1])<<16 | 
		uint32(data[15+length+2])<<8 | uint32(data[15+length+3])
	calculatedCRC := CRC32(data[:15+length])
	return receivedCRC == calculatedCRC
}

func (tv *TCPProtocolValidator) ValidateAll(data []byte) *ValidationResult {
	result := &ValidationResult{
		IsValid: true,
		Errors:  make([]error, 0),
	}

	if len(data) < tv.minLen || len(data) > tv.maxLen {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("invalid packet length"))
		return result
	}

	if !tv.ValidateHeader(data) {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("invalid header"))
	}

	if !tv.ValidateLength(data) {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("incomplete packet"))
	}

	if !tv.ValidateChecksum(data) {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("checksum mismatch"))
	}

	return result
}

type PrivateProtocolValidator struct {
	minLen int
	maxLen int
}

func NewPrivateProtocolValidator(minLen, maxLen int) *PrivateProtocolValidator {
	return &PrivateProtocolValidator{
		minLen: minLen,
		maxLen: maxLen,
	}
}

func (pv *PrivateProtocolValidator) ValidateHeader(data []byte) bool {
	if len(data) < 2 {
		return false
	}
	return data[0] == 0xAA && data[1] == 0x55
}

func (pv *PrivateProtocolValidator) ValidateLength(data []byte) bool {
	if len(data) < 13 {
		return false
	}
	dataLen := uint16(data[11]) | uint16(data[12])<<8
	return len(data) >= int(13+dataLen+4)
}

func (pv *PrivateProtocolValidator) ValidateChecksum(data []byte) bool {
	if len(data) < 13 {
		return false
	}
	dataLen := uint16(data[11]) | uint16(data[12])<<8
	if len(data) < int(13+dataLen+2) {
		return false
	}
	receivedCRC := uint16(data[13+dataLen]) | uint16(data[13+dataLen+1])<<8
	calculatedCRC := CRC16(data[:13+dataLen])
	return receivedCRC == calculatedCRC
}

func (pv *PrivateProtocolValidator) ValidateAll(data []byte) *ValidationResult {
	result := &ValidationResult{
		IsValid: true,
		Errors:  make([]error, 0),
	}

	if len(data) < 17 || len(data) > pv.maxLen {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("invalid packet length"))
		return result
	}

	if !pv.ValidateHeader(data) {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("invalid frame header"))
	}

	if !pv.ValidateLength(data) {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("incomplete packet"))
	}

	if !pv.ValidateChecksum(data) {
		result.IsValid = false
		result.Errors = append(result.Errors, errors.New("CRC16 mismatch"))
	}

	return result
}
