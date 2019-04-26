cmake_minimum_required(VERSION 3.5)

project(tvm_infer)

add_definitions("-Wall -g -O2")
SET(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++11")

if(BenchMark)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -DBenchMark")
endif()

if(GPU)
    include(cmake/Util.cmake)
    include(cmake/FindCUDA.cmake)
    set(USE_CUDA ON)
    find_cuda(${USE_CUDA})
    INCLUDE_DIRECTORIES(/usr/local/cuda/include)
endif()

find_package( OpenCV REQUIRED )
message(STATUS "CMAKE_CURRENT_SOURCE_DIR: ${CMAKE_CURRENT_SOURCE_DIR}")
message(STATUS "CMAKE_CURRENT_BINARY_DIR: ${CMAKE_CURRENT_BINARY_DIR}")
include_directories(${OpenCV_INCLUDE_DIRS})

include_directories(${PROJECT_SOURCE_DIR}/include)

message(STATUS "tvm root path: ${TVM_ROOT}")
include_directories(${TVM_ROOT} ${TVM_ROOT}/include ${TVM_ROOT}/3rdparty/dmlc-core/include ${TVM_ROOT}/3rdparty/dlpack/include)

link_directories(
  ${OpenCV_Install}/lib
  /usr/local/lib
)

if (APPLE)
    link_directories(/usr/local/opt/boost/lib)
else()
    if(GPU)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -DUSE_CUDA_INFER")
    else()
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -DCPU_BINDING")
    endif()
endif()

SET(TVM_SOURCE src/loader/tvm_model.cpp src/loader/tvm_runtime_pack.cc )
if(GPU)
    SET(TVM_LIB ${CUDA_CUDA_LIBRARY} ${CUDA_CUDART_LIBRARY} pthread dl)
else()
    SET(TVM_LIB pthread dl)
endif()

add_executable(test_infer src/infer/test_infer.cpp src/infer/tvm_r100.cpp src/infer/tvm_mneti.cpp
                          ${TVM_SOURCE})
target_link_libraries(test_infer ${OpenCV_LIBS} ${TVM_LIB})

add_executable(test_gender-age src/infer/test_gender-age.cpp src/infer/tvm_age.cpp src/infer/tvm_gender.cpp
                               ${TVM_SOURCE})
target_link_libraries(test_gender-age ${OpenCV_LIBS} ${TVM_LIB})

add_executable(bench_multi_model src/infer/bench_multi_model.cpp src/infer/tvm_r100.cpp src/infer/tvm_mneti.cpp
                                ${TVM_SOURCE})
target_link_libraries(bench_multi_model ${OpenCV_LIBS} ${TVM_LIB})

add_executable(bench_mix_model src/infer/bench_mix_model.cpp src/infer/tvm_r100.cpp src/infer/tvm_mneti.cpp
                               ${TVM_SOURCE})
target_link_libraries(bench_mix_model ${OpenCV_LIBS} ${TVM_LIB})

find_package ( cppnetlib 0.13.0 REQUIRED )
include_directories ( ${CPPNETLIB_INCLUDE_DIRS} )
SET(NETLIB ${CPPNETLIB_LIBRARIES} boost_system)

add_executable(test_http src/http/test_http.cpp)
target_link_libraries(test_http ${NETLIB} pthread)

include_directories(${PROJECT_SOURCE_DIR}/deps/multipart-parser)

add_executable(tvm_svc src/http/tvm_server.cpp
                       src/infer/tvm_r100.cpp src/infer/tvm_mneti.cpp src/infer/tvm_gender.cpp src/infer/tvm_age.cpp
                       src/loader/tvm_model.cpp src/loader/tvm_runtime_pack.cc
                       src/utils/face_align.cpp src/utils/base64.cpp src/utils/face_param.cpp)
target_link_libraries(tvm_svc ${OpenCV_LIBS} ${TVM_LIB} ${NETLIB}) 
