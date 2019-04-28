# Http结果码
- 200 OK，返回json array，每个entry的定义：

    {

       "age":43,  
    
       "embedding":"rOIc/aAXcP00dEr8=......",
    
       "filename":"test2_1.jpg",
    
       "gender":0,
    
       "pose_type":0,
    
       "state":0,

       "quality":0.9303406476974487,
    
       "comment":"embedding为base64编码的512长度的float数组，
                  
                  state为0时表示结果成功：
                  
                  state不为0表示错误码，没有embedding字段，会增加一个error字段描述错误"
    
      }
    
     处理失败的entry
    
     {
    
      "error":"face pose skew",
    
      "filename":"test3_2.jpg",
    
      "pose_type":3,
    
      "state":-7
    
     }
- 非200 OK，返回消息体为json object，result_info字段描述错误原因：

     {
  
        "result_info":"can not found content-length in header"

     }

# state结果码说明:

state | error
------|-----------------------------------------------------------
-1    | input image size too small  
-2    | detect no face  
-3    | detect more than one face 
-4    | face area is tool small
-5    | failed to find similar transform matrix for face alignment
-6    | opencv exception
-7    | face pose skew
-8    | face norm[] is too small



# BenchMark

| E5-2630 v3 @ 2.40GHz | batch size | average latency | query per second |
| :------------------: | :--------: | :-------------: | :--------------: |
|        8 core        |     10     |      260ms      |       3.8        |
|        8 core        |     20     |      200ms      |        4         |
|       24 core        |     10     |      220ms      |       4.6        |
|       24 core        |     20     |      160ms      |       6.3        |
|       32 core        |     10     |      190ms      |       5.3        |
|       32 core        |     20     |      135ms      |       7.4        |

| GPU Tesla P40(1 card) | batch size | average latency | query per second |
| :-------------------: | :--------: | :-------------: | :--------------: |
|   1 service process   |     1      |     75.8ms      |       13.2       |
|   1 service process   |     5      |      43ms       |        23        |
|   1 service process   |     10     |      35ms       |       28.5       |
|   2 service process   |     1      |     77.9ms      |       24.6       |
|   2 service process   |     5      |     50.8ms      |       38.3       |
|   2 service process   |     10     |     55.3ms      |       37.1       |