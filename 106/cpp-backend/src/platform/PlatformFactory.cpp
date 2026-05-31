#include "printer/platform/IPlatform.h"

#ifdef _WIN32
#include "WindowsPlatform.cpp"
#else
#include "LinuxPlatform.cpp"
#endif

namespace printer {
namespace platform {

PLATFORM_API IPlatform* createPlatform() {
#ifdef _WIN32
    return new WindowsPlatform();
#else
    return new LinuxPlatform();
#endif
}

PLATFORM_API void destroyPlatform(IPlatform* platform) {
    delete platform;
}

}
}
