cmake_minimum_required(VERSION 3.15)
project(PrinterBackend VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

option(BUILD_SHARED_LIBS "Build shared libraries" ON)

include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

file(GLOB_RECURSE PLATFORM_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/platform/*.cpp
)

file(GLOB_RECURSE DRIVER_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/driver/*.cpp
)

file(GLOB_RECURSE TASK_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/task/*.cpp
)

file(GLOB_RECURSE STATUS_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/status/*.cpp
)

file(GLOB_RECURSE TEMPLATE_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/template/*.cpp
)

file(GLOB_RECURSE CORE_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/core/*.cpp
)

add_library(printer_backend
    ${PLATFORM_SOURCES}
    ${DRIVER_SOURCES}
    ${TASK_SOURCES}
    ${STATUS_SOURCES}
    ${TEMPLATE_SOURCES}
    ${CORE_SOURCES}
)

target_include_directories(printer_backend PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

if(WIN32)
    target_compile_definitions(printer_backend PRIVATE PLATFORM_WINDOWS)
    target_link_libraries(printer_backend PRIVATE winspool.lib)
elseif(UNIX)
    target_compile_definitions(printer_backend PRIVATE PLATFORM_LINUX)
    target_link_libraries(printer_backend PRIVATE cups pthread)
endif()

if(MSVC)
    target_compile_options(printer_backend PRIVATE /W4)
else()
    target_compile_options(printer_backend PRIVATE -Wall -Wextra -Wpedantic)
endif()

install(TARGETS printer_backend
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)

install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/include/
    DESTINATION include
)
