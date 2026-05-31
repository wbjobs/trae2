#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <vector>
#include <string>
#include <sstream>
#include <emscripten.h>

extern "C" {

#define MAX_WARNINGS 256
#define MAX_WARNING_MSG_LEN 128

struct WarningEntry {
    uint32_t offset;
    int32_t warning_code;
    char message[MAX_WARNING_MSG_LEN];
};

struct NALUResult {
    uint32_t start_code_offset;
    uint32_t nalu_size;
    uint8_t nal_type;
    uint8_t temporal_id;
    int32_t sei_payload_type;
    uint32_t sei_payload_size;
    uint32_t sei_payload_offset;
    bool has_sei;
    bool is_user_data_registered;
    bool has_warning;
    int32_t warning_code;
    char uuid_iso_iec_11578[17];
    char sei_text[4096];
    uint32_t sei_text_len;
    int32_t error_code;
    char error_msg[256];
};

struct ParseContext {
    uint8_t* data;
    uint32_t data_size;
    uint32_t current_pos;
};

enum WarningCode {
    WARN_NONE = 0,
    WARN_SEI_PAYLOAD_SIZE_OVERFLOW = 1001,
    WARN_SEI_PAYLOAD_TYPE_INVALID = 1002,
    WARN_SEI_UUID_TRUNCATED = 1003,
    WARN_SEI_DATA_TRUNCATED = 1004,
    WARN_EBSP_PARSE_ERROR = 1005,
    WARN_NALU_SIZE_TOO_LARGE = 1006,
    WARN_SEI_TEXT_TOO_LONG = 1007
};

static const char* nal_type_names[] = {
    "TRAIL_N", "TRAIL_R", "TSA_N", "TSA_R", "STSA_N", "STSA_R",
    "RADL_N", "RADL_R", "RASL_N", "RASL_R", "RSV_VCL_N10", "RSV_VCL_R11",
    "RSV_VCL_N12", "RSV_VCL_R13", "RSV_VCL_N14", "RSV_VCL_R15",
    "BLA_W_LP", "BLA_W_RADL", "BLA_N_LP", "IDR_W_RADL", "IDR_N_LP",
    "CRA_NUT", "RSV_RADL_RVCL22", "RSV_RADL_RVCL23",
    "RSV_VCL24", "RSV_VCL25", "RSV_VCL26", "RSV_VCL27",
    "RSV_VCL28", "RSV_VCL29", "RSV_VCL30", "RSV_VCL31",
    "VPS_NUT", "SPS_NUT", "PPS_NUT", "AUD_NUT",
    "EOS_NUT", "EOB_NUT", "FD_NUT", "PREFIX_SEI_NUT",
    "SUFFIX_SEI_NUT", "RSV_NVCL41", "RSV_NVCL42", "RSV_NVCL43",
    "RSV_NVCL44", "RSV_NVCL45", "RSV_NVCL46", "RSV_NVCL47",
    "UNSPEC48", "UNSPEC49", "UNSPEC50", "UNSPEC51",
    "UNSPEC52", "UNSPEC53", "UNSPEC54", "UNSPEC55",
    "UNSPEC56", "UNSPEC57", "UNSPEC58", "UNSPEC59",
    "UNSPEC60", "UNSPEC61", "UNSPEC62", "UNSPEC63"
};

static const char* sei_payload_type_names[] = {
    "Buffering Period", "Picture Timing", "Pan-Scan Rect", "Filler Payload",
    "User Data Registered", "User Data Unregistered", "Recovery Point",
    "Dec Ref Pic Marking Repetition", "SpaREL Info", "Chroma Resampling Filter Hint",
    "Tone Mapping Info", "Frame Packing Arrangement", "Display Orientation",
    "Structure of Pictures Info", "Active Parameter Sets", "Decoding Unit Info",
    "Temporal Sub-Zero Index", "Decoded Picture Hash", "Temporal Motion Constrained Tile Sets",
    "Layer Representation Information", "Sub-Picture Region Information",
    "Reserved18", "Reserved19", "Reserved20", "Reserved21", "Reserved22",
    "Green Meta Info", "Mastering Display Colour Volume", "Colour Remapping Info",
    "Content Colour Volume", "Time Code", "Neural Network Post Filter Info",
    "Neural Network Post Filter Activation", "Film Grain Characteristics",
    "Reserved31", "Reserved32", "Reserved33", "Reserved34", "Reserved35",
    "Reserved36", "Reserved37", "Reserved38", "Reserved39", "Reserved40"
};

void str_copy(char* dst, const char* src, uint32_t max_len) {
    if (!dst || !src) return;
    uint32_t i = 0;
    while (src[i] && i < max_len - 1) {
        dst[i] = src[i];
        i++;
    }
    dst[i] = '\0';
}

void set_warning(NALUResult* result, int32_t code, const char* msg) {
    if (!result) return;
    result->has_warning = true;
    result->warning_code = code;
    if (msg) {
        str_copy(result->error_msg, msg, sizeof(result->error_msg));
    }
}

uint32_t safe_find_start_code(const uint8_t* data, uint32_t size, uint32_t pos) {
    if (!data || pos + 3 >= size) return size;
    
    for (uint32_t i = pos; i + 3 < size; i++) {
        if (data[i] == 0 && data[i + 1] == 0) {
            if (i + 4 < size && data[i + 2] == 0 && data[i + 3] == 1) {
                return i;
            }
            if (data[i + 2] == 1) {
                return i;
            }
        }
    }
    return size;
}

uint32_t safe_find_next_start_code(const uint8_t* data, uint32_t size, uint32_t pos) {
    if (!data || pos + 3 >= size) return size;
    
    for (uint32_t i = pos; i + 3 < size; i++) {
        if (data[i] == 0 && data[i + 1] == 0) {
            if (i + 4 < size && data[i + 2] == 0 && data[i + 3] == 1) {
                return i;
            }
            if (data[i + 2] == 1) {
                return i;
            }
        }
    }
    return size;
}

uint32_t safe_get_start_code_length(const uint8_t* data, uint32_t size, uint32_t pos) {
    if (!data || pos + 3 >= size) return 0;
    
    if (pos + 4 < size &&
        data[pos] == 0 && data[pos + 1] == 0 &&
        data[pos + 2] == 0 && data[pos + 3] == 1) {
        return 4;
    }
    if (data[pos] == 0 && data[pos + 1] == 0 && data[pos + 2] == 1) {
        return 3;
    }
    return 0;
}

bool safe_parse_sei_payload(const uint8_t* nalu_data, uint32_t nalu_size, 
                            uint32_t nal_header_size, NALUResult* result,
                            uint32_t global_offset) {
    if (!nalu_data || !result || nal_header_size >= nalu_size) {
        return false;
    }
    
    result->has_sei = false;
    result->sei_payload_type = -1;
    result->sei_payload_size = 0;
    result->sei_payload_offset = 0;
    result->is_user_data_registered = false;
    result->sei_text_len = 0;
    result->has_warning = false;
    result->warning_code = 0;
    memset(result->uuid_iso_iec_11578, 0, sizeof(result->uuid_iso_iec_11578));
    memset(result->sei_text, 0, sizeof(result->sei_text));
    memset(result->error_msg, 0, sizeof(result->error_msg));

    const uint32_t MAX_NALU_SIZE = 10 * 1024 * 1024;
    if (nalu_size > MAX_NALU_SIZE) {
        set_warning(result, WARN_NALU_SIZE_TOO_LARGE, "NAL unit size exceeds safe limit");
        return false;
    }

    uint32_t offset = nal_header_size;
    
    std::vector<uint8_t> rbsp;
    rbsp.reserve(nalu_size - nal_header_size);
    
    try {
        for (uint32_t i = offset; i < nalu_size; i++) {
            if (i + 2 < nalu_size && 
                nalu_data[i] == 0 && nalu_data[i + 1] == 0 && nalu_data[i + 2] == 3) {
                if (rbsp.size() + 2 > MAX_NALU_SIZE) {
                    set_warning(result, WARN_EBSP_PARSE_ERROR, "RBSP size exceeded during EBSP parsing");
                    return false;
                }
                rbsp.push_back(nalu_data[i]);
                rbsp.push_back(nalu_data[i + 1]);
                i += 2;
            } else {
                if (rbsp.size() + 1 > MAX_NALU_SIZE) {
                    set_warning(result, WARN_EBSP_PARSE_ERROR, "RBSP size exceeded during EBSP parsing");
                    return false;
                }
                rbsp.push_back(nalu_data[i]);
            }
        }
    } catch (...) {
        set_warning(result, WARN_EBSP_PARSE_ERROR, "Exception during EBSP parsing");
        return false;
    }

    if (rbsp.empty()) {
        return true;
    }

    uint32_t rbsp_pos = 0;
    const uint32_t MAX_PAYLOAD_TYPE = 255;
    const uint32_t MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
    
    while (rbsp_pos < rbsp.size()) {
        uint32_t payload_type = 0;
        uint32_t type_bytes = 0;
        
        while (rbsp_pos < rbsp.size() && rbsp[rbsp_pos] == 0xFF) {
            payload_type += 255;
            rbsp_pos++;
            type_bytes++;
            if (type_bytes > 10 || payload_type > MAX_PAYLOAD_TYPE * 10) {
                set_warning(result, WARN_SEI_PAYLOAD_TYPE_INVALID, "SEI payload type too large");
                return false;
            }
        }
        if (rbsp_pos >= rbsp.size()) break;
        payload_type += rbsp[rbsp_pos];
        rbsp_pos++;

        uint32_t payload_size = 0;
        uint32_t size_bytes = 0;
        
        while (rbsp_pos < rbsp.size() && rbsp[rbsp_pos] == 0xFF) {
            payload_size += 255;
            rbsp_pos++;
            size_bytes++;
            if (size_bytes > 10 || payload_size > MAX_PAYLOAD_SIZE) {
                char msg[128];
                snprintf(msg, sizeof(msg), 
                        "SEI payload size exceeded safe limit at offset 0x%X", 
                        global_offset);
                set_warning(result, WARN_SEI_PAYLOAD_SIZE_OVERFLOW, msg);
                return false;
            }
        }
        if (rbsp_pos >= rbsp.size()) {
            set_warning(result, WARN_SEI_DATA_TRUNCATED, "SEI payload size truncated");
            return false;
        }
        payload_size += rbsp[rbsp_pos];
        rbsp_pos++;

        if (payload_size > MAX_PAYLOAD_SIZE) {
            char msg[128];
            snprintf(msg, sizeof(msg), 
                    "SEI payload size %u exceeds limit at offset 0x%X", 
                    payload_size, global_offset);
            set_warning(result, WARN_SEI_PAYLOAD_SIZE_OVERFLOW, msg);
            return false;
        }

        if (rbsp_pos + payload_size > rbsp.size()) {
            char msg[128];
            snprintf(msg, sizeof(msg), 
                    "SEI payload truncated at offset 0x%X, expected %u bytes, got %zu",
                    global_offset, payload_size, rbsp.size() - rbsp_pos);
            set_warning(result, WARN_SEI_DATA_TRUNCATED, msg);
            payload_size = rbsp.size() - rbsp_pos;
        }

        result->has_sei = true;
        result->sei_payload_type = static_cast<int32_t>(payload_type);
        result->sei_payload_size = payload_size;
        result->sei_payload_offset = rbsp_pos;

        if (payload_type == 4) {
            result->is_user_data_registered = true;
            if (rbsp_pos + 16 <= rbsp.size()) {
                char* uuid_ptr = result->uuid_iso_iec_11578;
                for (int i = 0; i < 16 && (uint32_t)(i * 2) < sizeof(result->uuid_iso_iec_11578) - 1; i++) {
                    snprintf(uuid_ptr + i * 2, 3, "%02X", rbsp[rbsp_pos + i]);
                }
                result->uuid_iso_iec_11578[16] = '\0';

                uint32_t data_offset = rbsp_pos + 16;
                uint32_t data_len = payload_size > 16 ? payload_size - 16 : 0;
                
                if (data_len > 0 && data_offset + data_len <= rbsp.size()) {
                    result->sei_text_len = data_len > 4095 ? 4095 : data_len;
                    memcpy(result->sei_text, &rbsp[data_offset], result->sei_text_len);
                    result->sei_text[result->sei_text_len] = '\0';
                }
            } else {
                set_warning(result, WARN_SEI_UUID_TRUNCATED, "SEI UUID truncated");
            }
        } else if (payload_type == 5) {
            if (rbsp_pos + payload_size <= rbsp.size() && payload_size > 0) {
                result->sei_text_len = payload_size > 4095 ? 4095 : payload_size;
                memcpy(result->sei_text, &rbsp[rbsp_pos], result->sei_text_len);
                result->sei_text[result->sei_text_len] = '\0';
            }
        }

        rbsp_pos += payload_size;
        if (rbsp_pos > rbsp.size()) {
            rbsp_pos = rbsp.size();
        }
    }

    return true;
}

EMSCRIPTEN_KEEPALIVE
void safe_parse_nalu(uint8_t* data, uint32_t data_size, uint32_t start_offset, NALUResult* result) {
    if (!data || !result) {
        if (result) {
            result->error_code = -1;
            str_copy(result->error_msg, "Invalid parameters", sizeof(result->error_msg));
        }
        return;
    }

    memset(result, 0, sizeof(NALUResult));
    result->error_code = 0;
    result->sei_payload_type = -1;

    if (data_size == 0 || start_offset >= data_size) {
        result->error_code = -2;
        str_copy(result->error_msg, "Start offset out of bounds", sizeof(result->error_msg));
        return;
    }

    uint32_t start_code_pos = safe_find_start_code(data, data_size, start_offset);
    if (start_code_pos >= data_size - 2) {
        result->error_code = -3;
        str_copy(result->error_msg, "No start code found", sizeof(result->error_msg));
        return;
    }

    result->start_code_offset = start_code_pos;
    uint32_t start_code_len = safe_get_start_code_length(data, data_size, start_code_pos);
    
    if (start_code_len == 0) {
        result->error_code = -4;
        str_copy(result->error_msg, "Invalid start code", sizeof(result->error_msg));
        return;
    }
    
    uint32_t nalu_start = start_code_pos + start_code_len;

    if (nalu_start >= data_size) {
        result->error_code = -5;
        str_copy(result->error_msg, "NAL unit start out of bounds", sizeof(result->error_msg));
        return;
    }

    uint32_t next_start = safe_find_next_start_code(data, data_size, nalu_start);
    
    if (next_start > data_size) {
        next_start = data_size;
    }
    
    result->nalu_size = next_start - nalu_start;
    
    const uint32_t MAX_SAFE_NALU_SIZE = 100 * 1024 * 1024;
    if (result->nalu_size > MAX_SAFE_NALU_SIZE) {
        result->nalu_size = MAX_SAFE_NALU_SIZE;
        set_warning(result, WARN_NALU_SIZE_TOO_LARGE, "NAL unit size clamped to safe limit");
    }

    if (result->nalu_size < 2) {
        result->error_code = -6;
        str_copy(result->error_msg, "NAL unit header too short", sizeof(result->error_msg));
        return;
    }

    if (nalu_start + 1 >= data_size) {
        result->error_code = -7;
        str_copy(result->error_msg, "NAL header out of bounds", sizeof(result->error_msg));
        return;
    }

    uint16_t nal_header = (data[nalu_start] << 8) | data[nalu_start + 1];
    result->nal_type = (nal_header >> 9) & 0x3F;
    result->temporal_id = (nal_header >> 0) & 0x7;

    if (result->nal_type == 39 || result->nal_type == 40) {
        uint32_t global_offset = start_offset + start_code_pos;
        bool parse_ok = safe_parse_sei_payload(
            &data[nalu_start], 
            result->nalu_size, 
            2, 
            result,
            global_offset
        );
        
        if (!parse_ok && !result->has_warning) {
            result->error_code = -8;
            str_copy(result->error_msg, "SEI payload parsing failed", sizeof(result->error_msg));
        }
    }
}

EMSCRIPTEN_KEEPALIVE
uint32_t safe_find_nalu_in_chunk(uint8_t* data, uint32_t data_size, uint32_t start_offset, 
                                  uint8_t* result_buffer, uint32_t result_buffer_size, 
                                  uint32_t max_nalus,
                                  uint8_t* warning_buffer, uint32_t warning_buffer_size,
                                  uint32_t* warning_count) {
    if (!data || !result_buffer || !warning_count) return 0;

    *warning_count = 0;
    
    uint32_t count = 0;
    uint32_t pos = start_offset;
    const uint32_t nalu_result_size = sizeof(NALUResult);
    const uint32_t warning_entry_size = sizeof(WarningEntry);

    while (count < max_nalus && pos + 3 < data_size) {
        if (count * nalu_result_size + nalu_result_size > result_buffer_size) {
            break;
        }
        
        NALUResult* result = (NALUResult*)(result_buffer + count * nalu_result_size);
        safe_parse_nalu(data, data_size, pos, result);

        if (result->error_code != 0 && result->error_code != -8) {
            if (*warning_count < MAX_WARNINGS && 
                *warning_count * warning_entry_size + warning_entry_size <= warning_buffer_size) {
                WarningEntry* warning = (WarningEntry*)(warning_buffer + (*warning_count) * warning_entry_size);
                warning->offset = pos;
                warning->warning_code = result->error_code;
                str_copy(warning->message, result->error_msg, MAX_WARNING_MSG_LEN);
                (*warning_count)++;
            }
            pos++;
            continue;
        }

        if (result->has_warning) {
            if (*warning_count < MAX_WARNINGS && 
                *warning_count * warning_entry_size + warning_entry_size <= warning_buffer_size) {
                WarningEntry* warning = (WarningEntry*)(warning_buffer + (*warning_count) * warning_entry_size);
                warning->offset = start_offset + result->start_code_offset;
                warning->warning_code = result->warning_code;
                str_copy(warning->message, result->error_msg, MAX_WARNING_MSG_LEN);
                (*warning_count)++;
            }
        }

        count++;
        
        uint32_t start_code_len = safe_get_start_code_length(data, data_size, result->start_code_offset);
        uint32_t next_pos = result->start_code_offset + start_code_len + result->nalu_size;
        
        if (next_pos <= pos || next_pos >= data_size) {
            pos++;
        } else {
            pos = next_pos;
        }
    }

    return count;
}

}
