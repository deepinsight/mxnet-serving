#include <boost/network/protocol/http/server.hpp>
#include <iostream>
#include <boost/range/algorithm/find_if.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;

namespace http = boost::network::http;

#include <opencv2/opencv.hpp>

#include <exception>
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
#include "face_align.h"

tvm_mneti * det;
tvm_r100  * embeding;
int min_width =70;
int min_height=90;
int min_area=5000;

class FaceAlign face_align = FaceAlign();

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
    inline void make_response(server::connection_ptr & connection){
        result["error"] = error;
        res_body = result.dump()+"\n";
        headers[3].value = std::to_string(res_body.length());
        connection->set_headers(boost::make_iterator_range(headers, headers + 4));
        connection->write(res_body);
    }
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
        res_body.clear();
        boundary.clear();
        result.clear();
        error.clear();
        if(request.method != "POST"){
            std::cerr << "request method must be post\n";
            connection->set_status(server::connection::not_supported);
            error = "request method must be post";
            make_response(connection);
            return;
        }
        server::request::headers_container_type::iterator found =
                boost::find_if(request.headers, content_type());
        if (found != request.headers.end()) {
            // std::cout << "found content-type header: " << found->name << ": " << found->value << std::endl;
            std::string content_type_str = found->value;
            if(content_type_str.find("multipart/form-data")!=0){
                std::cerr << "content-type is wrong, expected multipart/form-data\n";
                error = "content-type is wrong, expected multipart/form-data";           
                connection->set_status(server::connection::bad_request);
                make_response(connection);
                return;
            } else {
                size_t boundary_start = content_type_str.find("boundary=");
                if(boundary_start<0) {
                    std::cerr << "can't find boundary\n";
                    error = "can't find boundary";
                    connection->set_status(server::connection::bad_request);
                    make_response(connection);
                    return;                    
                }
                boundary = content_type_str.substr(boundary_start+9,content_type_str.length());
                // std::cout << "boundary=" << boundary << "\n";
            }
        } else {
            std::cerr << "can not found content-type in header\n";
            error = "can not found content-type in header";           
            connection->set_status(server::connection::bad_request);
            make_response(connection);
            return;
        }
        int cl = 0;
        found = boost::find_if(request.headers, content_length());
        if(found != request.headers.end())
            cl = atoi(std::string(found->value).c_str());
        else {
            std::cerr << "can not found content-length in header\n";
            error = "can not found content-length in header";
            connection->set_status(server::connection::bad_request);
            make_response(connection);
            return;
        }
        assert(cl>0);
        read_chunk(cl, connection);
    }
    void handle_post_read(server::connection::input_range range, 
        boost::system::error_code boost_error, size_t size, 
        server::connection_ptr conn, size_t left2read) {
        if(!boost_error) {
            // std::cout << "read size: " << size << std::endl;
            req_body.append(boost::begin(range), size);
            size_t left = left2read - size;
            if(left>0) {
                read_chunk(left, conn);
            } else {
                // std::cout << "FINISHED at " << req_body.size()<< std::endl;
                std::cout << "req_body length: " << req_body.length() << "\n";
                // std::cout << req_body << "\n";
                // update content-length
                formDataParser fdparser(req_body.data(), req_body.length(), boundary);
                if(fdparser.succeeded()){
                    // std::cout << "form data parse success\n" ;
                    /*
                    for(auto & fd: fdparser.fds)  
                        std::cout << "form data, type=" << fd.type << ",name=" 
                                                        << fd.disposition["name"]
                                                        << ",filename="
                                                        << fd.disposition["filename"]
                                                        << ",data length="
                                                        << fd.data.length()
                                                        << "\n";
                    */
                    // face detect align padding recognize

                    if(!face_prcocess(fdparser.fds[0].data)){
                        std::cout << "image data process error\n";
                        conn->set_status(server::connection::bad_request);
                        make_response(conn);
                        return;
                    }               
                } else {
                    std::cout << "form data parse error: " << fdparser.getErrorMessage() << "\n";
                    error = "form data parse error: " + fdparser.getErrorMessage();
                    conn->set_status(server::connection::bad_request);
                    make_response(conn);
                    return;
                }
                conn->set_status(server::connection::ok);
                make_response(conn);
                return;
            }
        } else {
            std::cout << "boost error: " << boost_error.message() << "\n";
        }
    }
    void read_chunk(size_t left2read, server::connection_ptr conn) {
        // std::cout << "left2read: " << left2read << std::endl;
        conn->read(
            boost::bind(
                &tvm_svc::handle_post_read,
                this,
                _1, _2, _3, conn, left2read
                )
            );
    }
    bool face_prcocess(std::string & img_str){
        try{
            cv::Mat img = cv::imdecode(cv::Mat(1, img_str.size(), CV_8UC1, (uchar *) img_str.data()), CV_LOAD_IMAGE_COLOR);
            std::vector<cv::Rect2f>  boxes;
            std::vector<cv::Point2f> landmarks;
            std::vector<float>       scores;
            std::cout << "decode image size: " << img.size() << "\n";
            if(img.cols<min_width or img.rows<min_height){
                error = "input image size too small: " + std::to_string(img.cols) + "*" + std::to_string(img.rows);
                return false;
            }
            cv::Mat re_img,pad_img;
            if(img.rows > img.cols){
                cv::Size re_size(0, det->height);
                re_size.width = int(det->height*(float(img.cols)/img.rows));
                cv::resize(img, re_img, re_size);
                int len = det->width-re_size.width;
                int left = len/2;
                int right= len - left;
                cv::copyMakeBorder( re_img, pad_img, 0, 0, left, right, cv::BORDER_CONSTANT );
            } else {
                cv::Size re_size(det->width, 0);
                re_size.height = int(det->width*(float(img.rows)/img.cols));
                cv::resize(img, re_img, re_size);
                int len = det->height-re_size.height;
                int bottom = len/2;
                int top    = len - bottom;
                cv::copyMakeBorder( re_img, pad_img, top, bottom, 0, 0, cv::BORDER_CONSTANT );
            }

            // std::cout << "padding image size: " << pad_img.size() << "\n";
            det->detect(pad_img, boxes, landmarks, scores);
            if(boxes.size()==0){
                error = "detect no face";
                return false;
            } else if (boxes.size()>1) {
                error = "detect more than one face: " + std::to_string(boxes.size());
                return false;
            }
            auto & box = boxes[0];
            if(box.area()<min_area){
                error = "face area(" + std::to_string(box.area()) + ") is tool small";
                return false;
            }
            cv::Mat aligned_img = face_align.Align(img, landmarks);
            if(aligned_img.empty()){
                error = "failed to find similar transform matrix for face alignment";
                return false;
            }
            embeding->infer(aligned_img);
            embeding->parse_output(result);
            return true;
        }
        catch(std::exception & e) {
            std::cout << e.what() << "\n";
            error += "opencv exception: ";
            error += e.what();
            return false;
        }
    }

private:
    std::string req_body;
    std::string boundary;
    std::string res_body;
    json result;
    std::string error;

};

int main(int argc, char *argv[]) {

    const cv::String keys =
        "{help h usage ?     |                    | print this message }"
        "{ip                 |127.0.0.1           | server ip address }"
        "{port               |8080                | server port }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{cpu_family         |skylake             | cpu architect family name }"
        "{shape              |120,120             | detector model shape }"
        "{min-width          |70                  | minimal width of input image }"
        "{min-height         |90                  | minimal height of input image }"
        "{min-area           |5000                | minimal area of face bounding box }"
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
    min_width  = parser.get<int>("min-width");
    min_height = parser.get<int>("min-height");
    min_area   = parser.get<int>("min-area");
    // std::cout << "min-width: " << min_width << "\n";
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