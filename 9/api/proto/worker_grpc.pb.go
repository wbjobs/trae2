package workflowpb

import (
	"context"
	grpc "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
)

const (
	WorkerService_ServiceName = "workflow.WorkerService"
)

type WorkerServiceClient interface {
	ExecuteStep(ctx context.Context, in *ExecuteStepRequest, opts ...grpc.CallOption) (*ExecuteStepResponse, error)
}

type workerServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewWorkerServiceClient(cc grpc.ClientConnInterface) WorkerServiceClient {
	return &workerServiceClient{cc}
}

func (c *workerServiceClient) ExecuteStep(ctx context.Context, in *ExecuteStepRequest, opts ...grpc.CallOption) (*ExecuteStepResponse, error) {
	out := new(ExecuteStepResponse)
	err := c.cc.Invoke(ctx, "/workflow.WorkerService/ExecuteStep", in, out, opts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

type WorkerServiceServer interface {
	ExecuteStep(context.Context, *ExecuteStepRequest) (*ExecuteStepResponse, error)
	mustEmbedUnimplementedWorkerServiceServer()
}

type UnimplementedWorkerServiceServer struct{}

func (UnimplementedWorkerServiceServer) ExecuteStep(context.Context, *ExecuteStepRequest) (*ExecuteStepResponse, error) {
	return nil, grpc.Errorf(codes.Unimplemented, "method ExecuteStep not implemented")
}
func (UnimplementedWorkerServiceServer) mustEmbedUnimplementedWorkerServiceServer() {}

func RegisterWorkerServiceServer(s grpc.ServiceRegistrar, srv WorkerServiceServer) {
	s.RegisterService(&WorkerService_ServiceDesc, srv)
}

var WorkerService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "workflow.WorkerService",
	HandlerType: (*WorkerServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "ExecuteStep",
			Handler: func(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
				in := new(ExecuteStepRequest)
				if err := dec(in); err != nil {
					return nil, err
				}
				if interceptor == nil {
					return srv.(WorkerServiceServer).ExecuteStep(ctx, in)
				}
				info := &grpc.UnaryServerInfo{
					Server:     srv,
					FullMethod: "/workflow.WorkerService/ExecuteStep",
				}
				handler := func(ctx context.Context, req interface{}) (interface{}, error) {
					return srv.(WorkerServiceServer).ExecuteStep(ctx, req.(*ExecuteStepRequest))
				}
				return interceptor(ctx, in, info, handler)
			},
		},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "api/proto/workflow.proto",
}
