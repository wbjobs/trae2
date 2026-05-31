function [h_final, h_series] = gw_seepage_transient(k_field, s_field, h_initial, boundary_top, boundary_bottom, n_steps, recharge)
    % GW_SEEPAGE_TRANSIENT 瞬态渗流计算
    % 输入:
    %   k_field - 渗透率场
    %   s_field - 储水系数场
    %   h_initial - 初始水头
    %   boundary_top - 上边界水头
    %   boundary_bottom - 下边界水头
    %   n_steps - 时间步数
    %   recharge - 补给率
    % 输出:
    %   h_final - 最终水头场
    %   h_series - 水头时间序列

    [ny, nx] = size(k_field);
    h = h_initial;
    h_series = cell(n_steps + 1, 1);
    h_series{1} = h;

    dt = 1.0;
    dx = 10.0;
    dy = 10.0;

    for step = 1:n_steps
        h_new = h;
        for j = 2:ny-1
            for i = 2:nx-1
                k_c = k_field(j, i);
                k_e = 2.0 * k_c * k_field(j, i+1) / (k_c + k_field(j, i+1));
                k_w = 2.0 * k_c * k_field(j, i-1) / (k_c + k_field(j, i-1));
                k_n = 2.0 * k_c * k_field(j+1, i) / (k_c + k_field(j+1, i));
                k_s = 2.0 * k_c * k_field(j-1, i) / (k_c + k_field(j-1, i));

                s_c = s_field(j, i);
                laplacian = ...
                    (k_e * (h(j, i+1) - h(j, i)) - k_w * (h(j, i) - h(j, i-1))) / dx^2 + ...
                    (k_n * (h(j+1, i) - h(j, i)) - k_s * (h(j, i) - h(j-1, i))) / dy^2;

                h_new(j, i) = h(j, i) + dt / s_c * (laplacian + recharge);
            end
        end
        h_new(1, :) = boundary_bottom;
        h_new(end, :) = boundary_top;
        h = h_new;
        h_series{step + 1} = h;
    end

    h_final = h;
end
