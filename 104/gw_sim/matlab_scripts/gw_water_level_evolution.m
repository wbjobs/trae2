function h_result = gw_water_level_evolution(h_initial, params_json)
    % GW_WATER_LEVEL_EVOLUTION 水位演化计算
    params = jsondecode(params_json);
    h_result = h_initial;

    mode = params.mode;
    if strcmp(mode, 'seasonal')
        amplitude = 2.0;
        period = 365.0;
        if isfield(params, 'amplitude')
            amplitude = params.amplitude;
        end
        if isfield(params, 'period')
            period = params.period;
        end
        h_result = h_initial + amplitude * sin(2 * pi / period);
    elseif strcmp(mode, 'long_term')
        years = 10;
        decline_rate = 0.5;
        if isfield(params, 'years')
            years = params.years;
        end
        if isfield(params, 'annual_decline_rate')
            decline_rate = params.annual_decline_rate;
        end
        h_result = h_initial - years * decline_rate;
    end
end
