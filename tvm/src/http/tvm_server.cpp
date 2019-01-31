#include <boost/network/protocol/http/server.hpp>
#include <iostream>
#include <boost/range/algorithm/find_if.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;

namespace http = boost::network::http;

#include <opencv2/opencv.hpp>

#include <thread>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#ifdef CPU_BINDING
    #include <sys/sysinfo.h>
#endif

struct tvm_svc;
typedef http::server<tvm_svc> server;

#include "tvm_r100.h"
#include "tvm_mneti.h"

#include "form_data.h"

tvm_mneti * det;
tvm_r100  * embeding;

server::response_header headers[]= {{"Connection", "close"},
                                    {"Content-Type", "text/json"},
                                    {"From", "tvm-infer-server"},
                                    {"Content-Length", "0"}};

struct tvm_svc {

    struct content_type {
        template <class Header>
        bool operator()(Header const& header) {
            return boost::iequals(header.name, "Content-Type");
        }
    };

    struct content_length {
        template <class Header>
        bool operator()(Header const& header) {
            return boost::iequals(header.name, "Content-Length");
        }
    };

    void operator()(server::request const &request, server::connection_ptr connection) {
        server::string_type remote_addr = source(request);
        /*
        std::cout << "client: " << remote_addr;
        std::cout << "; path: " << request.destination;
        std::cout << "; method: " << request.method;
        std::cout << std::endl;
        for (auto const& header : request.headers) {
            std::cout << "request header: " << header.name << ": " << header.value << std::endl;
        }
        */
        req_body.clear();
        boundary.clear();
        result.clear();
        if(request.method != "POST"){
            std::cerr << "request method must be post\n";
            connection->set_status(server::connection::not_supported);
            result["error"] = "request method must be post";
            res_body = result.dump()+"\n";
            headers[3].value = std::to_string(res_body.length());
            connection->set_headers(boost::make_iterator_range(headers, headers + 4));
            connection->write(res_body);
            return;
        }
        server::request::headers_container_type::iterator found =
                boost::find_if(request.headers, content_type());
        if (found != request.headers.end()) {
            std::cout << "found content-type header: " << found->name << ": " << found->value << std::endl;
            std::string content_type_str = found->value;
            if(content_type_str.find("multipart/form-data")!=0){
                std::cerr << "content-type is wrong, expected multipart/form-data\n";
                result["error"] = "content-type is wrong, expected multipart/form-data";
                res_body = result.dump()+"\n";
                headers[3].value = std::to_string(res_body.length());            
                connection->set_status(server::connection::bad_request);
                connection->set_headers(boost::make_iterator_range(headers, headers + 4));
                connection->write(res_body);
                return;
            } else {
                size_t boundary_start = content_type_str.find("boundary=");
                if(boundary_start<0) {
                    std::cerr << "can't find boundary\n";
                    result["error"] = "can't find boundary";
                    res_body = result.dump()+"\n";
                    headers[3].value = std::to_string(res_body.length());            
                    connection->set_status(server::connection::bad_request);
                    connection->set_headers(boost::make_iterator_range(headers, headers + 4));
                    connection->write(res_body);
                    return;                    
                }
                boundary = content_type_str.substr(boundary_start+9,content_type_str.length());
                std::cout << "boundary=" << boundary << "\n";
            }
        } else {
            std::cerr << "can not found content-type in header\n";
            result["error"] = "can not found content-type in header";
            res_body = result.dump()+"\n";
            headers[3].value = std::to_string(res_body.length());            
            connection->set_status(server::connection::bad_request);
            connection->set_headers(boost::make_iterator_range(headers, headers + 4));
            connection->write(res_body);
            return;
        }
        int cl = 0;
        found = boost::find_if(request.headers, content_length());
        if(found != request.headers.end())
            cl = atoi(std::string(found->value).c_str());
        else {
            std::cerr << "can not found content-length in header\n";
            result["error"] = "can not found content-length in header";
            res_body = result.dump()+"\n";
            headers[3].value = std::to_string(res_body.length());
            connection->set_status(server::connection::bad_request);
            connection->set_headers(boost::make_iterator_range(headers, headers + 4));
            connection->write(res_body);
            return;            
        }
        assert(cl>0);
        read_chunk(cl, connection);
    }
    void handle_post_read(server::connection::input_range range, 
        boost::system::error_code error, size_t size, 
        server::connection_ptr conn, size_t left2read) {
        if(!error) {
            std::cout << "read size: " << size << std::endl;
            req_body.append(boost::begin(range), size);
            size_t left = left2read - size;
            if(left>0) {
                read_chunk(left, conn);
            } else {
                std::cout << "FINISHED at " << req_body.size()<< std::endl;
                std::cout << "req_body length: " << req_body.length() << "\n";
                // std::cout << req_body << "\n";
                // face detect align padding recognize
                // face_prcocess();
                // update content-length
                formDataParser fdparser(req_body.data(), req_body.length(), boundary);
                if(fdparser.succeeded()){
                    std::cout << "form data parse success\n" ;
                    result["info"] = "hello world";
                    try{
                        for(auto & fd: fdparser.fds){
                            std::cout << "form data, type=" << fd.type << ",name=" 
                                                            << fd.disposition["name"]
                                                            << ",filename="
                                                            << fd.disposition["filename"]
                                                            << ",data length="
                                                            << fd.data.length()
                                                            << "\n";
                        }
                    }
                    catch (json::exception & e ) {
                        std::cout << "fd.disposition json error: " << e.what() << "\n";
                    }
                    conn->set_status(server::connection::ok);
                } else {
                    std::cout << "form data parse error: " << fdparser.getErrorMessage() << "\n";
                    result["info"] = fdparser.getErrorMessage();
                    conn->set_status(server::connection::bad_request);
                }
                res_body = result.dump() + "\n";
                headers[3].value = std::to_string(res_body.length());
                // status
                // headers
                conn->set_headers(boost::make_iterator_range(headers, headers + 4));
                // body
                conn->write(res_body);

            }
        } else {
            std::cout << "error: " << error.message() << std::endl;
        }
    }
    void read_chunk(size_t left2read, server::connection_ptr conn) {
        std::cout << "left2read: " << left2read << std::endl;
        conn->read(
            boost::bind(
                &tvm_svc::handle_post_read,
                this,
                _1, _2, _3, conn, left2read
                )
            );
    }

private:
    std::string req_body;
    std::string boundary;
    std::string res_body;
    json result;


};

int main(int argc, char *argv[]) {

    const cv::String keys =
        "{help h usage ?     |                    | print this message }"
        "{ip                 |127.0.0.1           | server ip address }"
        "{port               |8080                | server port }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{cpu_family         |skylake             | cpu architect family name }"
        "{shape              |120,120             | model shape }"
        "{index              |0                   | server instance index for cpu binding }"
        "{cpu_count          |4                   | core count for cpu binding }"
    ;
    cv::CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model infer server");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    // create model handler
    std::string path = parser.get<cv::String>("path");
    std::string cpu_family  = parser.get<cv::String>("cpu_family");
    std::string model_shape  = parser.get<cv::String>("shape");
    std::string str1 = model_shape.substr(0, model_shape.find(","));
    std::string str2 = model_shape.substr(model_shape.find(",")+1, model_shape.length());
    int width  = atoi(str1.c_str());
    int height = atoi(str2.c_str());
    det      = new tvm_mneti(path, "mneti", cpu_family, width, height);
    embeding = new tvm_r100 (path, "r100",  cpu_family, 112, 112);

    // do cpu binding
    #ifdef CPU_BINDING
    std::string index       = parser.get<int>("index");
    std::string cpu_count   = parser.get<int>("cpu_count");
    int bindinglatency = parser.get<int>("bindinglatency"); 
    std::this_thread::sleep_for(std::chrono::seconds(bindinglatency));
    int cpu_min = index * cpu_count;
    int cpu_max = (index + 1) * cpu_count - 1;
    int pid = getpid();
    std::string taskset_cmd = "taskset -cap " 
                            + std::to_string(cpu_min) + "-" 
                            + std::to_string(cpu_max) + " " 
                            + std::to_string(pid);
    std::cout << taskset_cmd << "\n";
    system(taskset_cmd.c_str());
    #endif
    // run http server
    std::string ip   = parser.get<cv::String>("ip");
    std::string port = parser.get<cv::String>("port");
    try {
        tvm_svc handler;
        server::options options(handler);
        server server_(options.address(ip.c_str()).port(port.c_str()));
        server_.run();
    }
    catch (std::exception &e) {
        std::cerr << e.what() << std::endl;
        return 1;
    }

    return 0;
}