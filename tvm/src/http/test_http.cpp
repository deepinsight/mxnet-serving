#include <boost/network/protocol/http/server.hpp>
#include <iostream>
#include <boost/range/algorithm/find_if.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;

namespace http = boost::network::http;

struct http_demo;
typedef http::server<http_demo> server;

struct http_demo {

    struct content_type {
        template <class Header>
        bool operator()(Header const& header) {
            return boost::iequals(header.name, "Content-Type");
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

        static server::response_header headers[] = {{"Connection", "close"},
                                                    {"Content-Type", "text/json"},
                                                    {"From", "tvm-infer-server"},
                                                    {"Content-Length", "0"}};
        std::string body;
        json result;
        if(request.method != "POST"){
            std::cerr << "request method must be post\n";
            connection->set_status(server::connection::not_supported);
            result["error"] = "request method must be post";
            body = result.dump()+"\n";
            headers[3].value = std::to_string(body.length());
            connection->set_headers(boost::make_iterator_range(headers, headers + 4));
            connection->write(body);
            return;
        }
        server::request::headers_container_type::iterator found =
                boost::find_if(request.headers, content_type());
        if (found != request.headers.end()) {
            std::cout << "found content-type header: " << found->name << ": " << found->value << std::endl;
            if(found->value!="image/jpeg"){
                std::cerr << "content-type is wrong, expected image/jpeg\n";
                result["error"] = "content-type is wrong, expected image/jpeg";
                body = result.dump()+"\n";
                headers[3].value = std::to_string(body.length());            
                connection->set_status(server::connection::bad_request);
                connection->set_headers(boost::make_iterator_range(headers, headers + 4));
                connection->write(body);
                return;
            }
        } else {
            std::cerr << "can not found content-type in header\n";
            result["error"] = "can not found content-type in header";
            body = result.dump()+"\n";
            headers[3].value = std::to_string(body.length());            
            connection->set_status(server::connection::bad_request);
            connection->set_headers(boost::make_iterator_range(headers, headers + 4));
            connection->write(body);
            return;
        }

        // update content-length
        body = "hello world\n";
        headers[3].value = std::to_string(body.length());
        // status
        connection->set_status(server::connection::ok);
        // headers
        connection->set_headers(boost::make_iterator_range(headers, headers + 4));
        // body
        connection->write(body);
    }
};

int main(int argc, char *argv[]) {

    if (argc != 3) {
        std::cerr << "Usage: " << argv[0] << " address port" << std::endl;
        return 1;
    }

    try {
        http_demo handler;
        server::options options(handler);
        server server_(options.address(argv[1]).port(argv[2]));
        server_.run();
    }
    catch (std::exception &e) {
        std::cerr << e.what() << std::endl;
        return 1;
    }

    return 0;
}