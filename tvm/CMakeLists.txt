cmake_minimum_required(VERSION 2.8.10)

project(tvm_infer)

add_definitions("-Wall -g -O2")
SET(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++11")

find_package( OpenCV REQUIRED )
message(STATUS "CMAKE_CURRENT_SOURCE_DIR: ${CMAKE_CURRENT_SOURCE_DIR}")
message(STATUS "CMAKE_CURRENT_BINARY_DIR: ${CMAKE_CURRENT_BINARY_DIR}")
include_directories(${OpenCV_INCLUDE_DIRS})

include_directories(${PROJECT_SOURCE_DIR}/include)

message(STATUS "tvm root path: ${TVM_ROOT}")
include_directories(${TVM_ROOT} ${TVM_ROOT}/include/tvm ${TVM_ROOT}/3rdparty/dmlc-core/include ${TVM_ROOT}/3rdparty/dlpack/include)

link_directories(
  ${OpenCV_Install}/lib
  /usr/local/lib
)

add_executable(test_infer src/infer/test_infer.cpp src/infer/tvm_r100.cpp 
                          src/loader/tvm_model.cpp src/loader/tvm_runtime_pack.cc)
target_link_libraries(test_infer ${OpenCV_LIBS} pthread dl)