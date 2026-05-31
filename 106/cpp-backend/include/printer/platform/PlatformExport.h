#pragma once

#ifdef _WIN32
    #ifdef BUILDING_PRINTER_BACKEND
        #define PLATFORM_API __declspec(dllexport)
    #else
        #define PLATFORM_API __declspec(dllimport)
    #endif
#else
    #define PLATFORM_API __attribute__((visibility("default")))
#endif
