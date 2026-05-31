function h = gw_seepage_steady(k_field, boundary_top, boundary_bottom, recharge)
    % GW_SEEPAGE_STEADY 稳态渗流计算 (使用有限差分法)
    % 输入:
    %   k_field - 渗透率场矩阵
    %   boundary_top - 上边界水头
    %   boundary_bottom - 下边界水头
    %   recharge - 补给率
    % 输出:
    %   h - 计算得到的水头场

    [ny, nx] = size(k_field);
    n = nx * ny;

    A = sparse(n, n);
    rhs = zeros(n, 1);

    for j = 1:ny
        for i = 1:nx
            idx = (j-1)*nx + i;
            k_center = k_field(j, i);

            if j == 1
                A(idx, idx) = 1.0;
                rhs(idx) = boundary_bottom(i);
            elseif j == ny
                A(idx, idx) = 1.0;
                rhs(idx) = boundary_top(i);
            elseif i == 1
                A(idx, idx) = 1.0;
                rhs(idx) = boundary_bottom(j);
            elseif i == nx
                A(idx, idx) = 1.0;
                rhs(idx) = boundary_top(j);
            else
                k_e = 2.0 * k_center * k_field(j, i+1) / (k_center + k_field(j, i+1));
                k_w = 2.0 * k_center * k_field(j, i-1) / (k_center + k_field(j, i-1));
                k_n = 2.0 * k_center * k_field(j+1, i) / (k_center + k_field(j+1, i));
                k_s = 2.0 * k_center * k_field(j-1, i) / (k_center + k_field(j-1, i));

                coeff_e = k_e;
                coeff_w = k_w;
                coeff_n = k_n;
                coeff_s = k_s;
                coeff_c = -(coeff_e + coeff_w + coeff_n + coeff_s);

                A(idx, idx) = coeff_c;
                A(idx, idx+1) = coeff_e;
                A(idx, idx-1) = coeff_w;
                A(idx, idx+nx) = coeff_n;
                A(idx, idx-nx) = coeff_s;

                rhs(idx) = -recharge;
            end
        end
    end

    h_vec = A \ rhs;
    h = reshape(h_vec, ny, nx);
end
