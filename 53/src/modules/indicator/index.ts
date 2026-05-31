import type {
  WQICalculateParams,
  WQIResult,
  TLIResult,
  EcoHealthResult,
  WaterQuality,
} from '../../types';

export class IndicatorCalculator {
  calculateWQI(params: WQICalculateParams): WQIResult {
    const factorScores: Record<string, number> = {};
    let totalWeight = 0;
    let weightedSum = 0;

    const defaultWeights: Record<string, number> = {
      do: 0.15,
      ph: 0.10,
      cod: 0.15,
      nh3n: 0.15,
      tp: 0.12,
      tn: 0.12,
      algae: 0.10,
      chla: 0.11,
    };

    Object.entries(params.factorValues).forEach(([factorId, value]) => {
      const weight = params.weights?.[factorId] || defaultWeights[factorId] || 0.1;
      const score = this.getSingleFactorScore(factorId, value);

      factorScores[factorId] = score;
      weightedSum += score * weight;
      totalWeight += weight;
    });

    const finalScore = Math.round(weightedSum / (totalWeight || 1));
    const { level, levelText } = this.getWaterQualityLevel(finalScore);

    return {
      score: finalScore,
      level,
      levelText,
      factorScores,
    };
  }

  private getSingleFactorScore(factorId: string, value: number): number {
    switch (factorId) {
      case 'do':
        if (value >= 7.5) return 100;
        if (value >= 6) return 80 + ((value - 6) / 1.5) * 20;
        if (value >= 5) return 60 + ((value - 5) / 1) * 20;
        return 40 + Math.max(0, (value / 5) * 20);
      case 'ph':
        if (value >= 6.5 && value <= 8.5) return 100;
        if ((value >= 6 && value < 6.5) || (value > 8.5 && value <= 9)) {
          return 80 + (value < 6.5 ? (value - 6) / 0.5 * 20 : (9 - value) / 0.5 * 20);
        }
        return 50;
      case 'cod':
        if (value <= 15) return 100 - (value / 15) * 20;
        if (value <= 20) return 80 - ((value - 15) / 5) * 20;
        if (value <= 30) return 60 - ((value - 20) / 10) * 20;
        return Math.max(0, 40 - ((value - 30) / 20) * 40);
      case 'nh3n':
        if (value <= 0.15) return 100 - (value / 0.15) * 20;
        if (value <= 0.5) return 80 - ((value - 0.15) / 0.35) * 20;
        if (value <= 1.0) return 60 - ((value - 0.5) / 0.5) * 20;
        return Math.max(0, 40 - ((value - 1.0) / 2.0) * 40);
      case 'tp':
        if (value <= 0.02) return 100 - (value / 0.02) * 20;
        if (value <= 0.1) return 80 - ((value - 0.02) / 0.08) * 20;
        if (value <= 0.2) return 60 - ((value - 0.1) / 0.1) * 20;
        return Math.max(0, 40 - ((value - 0.2) / 0.3) * 40);
      case 'tn':
        if (value <= 0.2) return 100 - (value / 0.2) * 20;
        if (value <= 0.5) return 80 - ((value - 0.2) / 0.3) * 20;
        if (value <= 1.5) return 60 - ((value - 0.5) / 1.0) * 20;
        return Math.max(0, 40 - ((value - 1.5) / 2.0) * 40);
      case 'algae':
        if (value <= 100000) return 100 - (value / 100000) * 20;
        if (value <= 300000) return 80 - ((value - 100000) / 200000) * 20;
        if (value <= 1000000) return 60 - ((value - 300000) / 700000) * 20;
        return Math.max(0, 40 - ((value - 1000000) / 2000000) * 40);
      case 'chla':
        if (value <= 2) return 100 - (value / 2) * 20;
        if (value <= 5) return 80 - ((value - 2) / 3) * 20;
        if (value <= 10) return 60 - ((value - 5) / 5) * 20;
        return Math.max(0, 40 - ((value - 10) / 15) * 40);
      default:
        return 70;
    }
  }

  getWaterQualityLevel(score: number): { level: WaterQuality; levelText: string } {
    if (score >= 90) {
      return { level: 'excellent', levelText: '优' };
    } else if (score >= 70) {
      return { level: 'good', levelText: '良好' };
    } else if (score >= 50) {
      return { level: 'moderate', levelText: '轻度污染' };
    } else {
      return { level: 'poor', levelText: '重度污染' };
    }
  }

  calculateTLI(
    chla: number,
    tp: number,
    tn: number,
    cod: number,
    sd: number = 1.5
  ): TLIResult {
    const safeChla = Math.max(chla, 0.1);
    const safeTp = Math.max(tp, 0.001);
    const safeTn = Math.max(tn, 0.01);
    const safeCod = Math.max(cod, 0.1);
    const safeSd = Math.max(sd, 0.1);

    const tliChl = 10 * (2.5 + 1.086 * Math.log(safeChla));
    const tliTp = 10 * (9.436 + 1.624 * Math.log(safeTp));
    const tliTn = 10 * (5.453 + 1.694 * Math.log(safeTn));
    const tliCod = 10 * (0.109 + 2.661 * Math.log(safeCod));
    const tliSd = 10 * (5.118 - 1.94 * Math.log(safeSd));

    const weights = { chl: 0.27, tp: 0.18, tn: 0.18, cod: 0.19, sd: 0.18 };
    const score = Math.round(
      tliChl * weights.chl +
      tliTp * weights.tp +
      tliTn * weights.tn +
      tliCod * weights.cod +
      tliSd * weights.sd
    );

    const { level, levelText } = this.getEutrophicationLevel(score);

    return {
      score,
      level,
      levelText,
      factorScores: {
        chla: tliChl,
        tp: tliTp,
        tn: tliTn,
        cod: tliCod,
        sd: tliSd,
      },
    };
  }

  getEutrophicationLevel(score: number): { level: TLIResult['level']; levelText: string } {
    if (score < 30) {
      return { level: 'oligotrophic', levelText: '贫营养' };
    } else if (score < 50) {
      return { level: 'mesotrophic', levelText: '中营养' };
    } else if (score < 60) {
      return { level: 'light_eutrophic', levelText: '轻度富营养' };
    } else if (score < 70) {
      return { level: 'mid_eutrophic', levelText: '中度富营养' };
    } else {
      return { level: 'hyper_eutrophic', levelText: '重度富营养' };
    }
  }

  evaluateEcoHealth(params: {
    waterQualityScore: number;
    biodiversityIndex: number;
    habitatScore: number;
    ecosystemFunction: number;
  }): EcoHealthResult {
    const dimensions = {
      waterQuality: params.waterQualityScore,
      biodiversity: params.biodiversityIndex,
      habitat: params.habitatScore,
      ecosystemFunction: params.ecosystemFunction,
    };

    const weights = {
      waterQuality: 0.35,
      biodiversity: 0.25,
      habitat: 0.20,
      ecosystemFunction: 0.20,
    };

    const overallScore = Math.round(
      dimensions.waterQuality * weights.waterQuality +
      dimensions.biodiversity * weights.biodiversity +
      dimensions.habitat * weights.habitat +
      dimensions.ecosystemFunction * weights.ecosystemFunction
    );

    const level = this.getEcoHealthLevel(overallScore);

    return {
      overallScore,
      level,
      dimensions,
    };
  }

  private getEcoHealthLevel(score: number): EcoHealthResult['level'] {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 55) return 'fair';
    if (score >= 40) return 'poor';
    return 'very_poor';
  }

  getEcoHealthLevelText(level: EcoHealthResult['level']): string {
    const levelMap: Record<EcoHealthResult['level'], string> = {
      excellent: '优秀',
      good: '良好',
      fair: '一般',
      poor: '较差',
      very_poor: '极差',
    };
    return levelMap[level];
  }

  calculateOrganicPollutionIndex(
    cod: number,
    bod: number,
    nh3n: number,
    doValue: number
  ): number {
    const codStandard = 15;
    const bodStandard = 3;
    const nh3nStandard = 0.5;
    const doStandard = 6;

    const index =
      (cod / codStandard) +
      (bod / bodStandard) +
      (nh3n / nh3nStandard) -
      (doValue / doStandard);

    return Math.round(index * 100) / 100;
  }

  getOrganicPollutionLevel(index: number): { level: string; levelText: string; color: string } {
    if (index < 0) return { level: 'good', levelText: '良好', color: '#10b981' };
    if (index < 1) return { level: 'moderate', levelText: '较好', color: '#84cc16' };
    if (index < 2) return { level: 'light', levelText: '轻度污染', color: '#f59e0b' };
    if (index < 3) return { level: 'moderate_pollution', levelText: '中度污染', color: '#f97316' };
    if (index < 4) return { level: 'heavy', levelText: '较重污染', color: '#ef4444' };
    return { level: 'severe', levelText: '严重污染', color: '#991b1b' };
  }

  calculateAlgaeBloomRisk(
    algaeDensity: number,
    chla: number,
    waterTemp: number,
    ph: number
  ): { riskLevel: string; riskText: string; score: number } {
    let score = 0;

    if (algaeDensity >= 1000000) score += 30;
    else if (algaeDensity >= 300000) score += 20;
    else if (algaeDensity >= 100000) score += 10;

    if (chla >= 20) score += 30;
    else if (chla >= 10) score += 20;
    else if (chla >= 5) score += 10;

    if (waterTemp >= 28) score += 20;
    else if (waterTemp >= 25) score += 15;
    else if (waterTemp >= 20) score += 10;

    if (ph >= 9) score += 20;
    else if (ph >= 8.5) score += 15;
    else if (ph >= 8) score += 10;

    if (score >= 80) return { riskLevel: 'high', riskText: '高风险', score };
    if (score >= 60) return { riskLevel: 'medium_high', riskText: '中高风险', score };
    if (score >= 40) return { riskLevel: 'medium', riskText: '中风险', score };
    if (score >= 20) return { riskLevel: 'low', riskText: '低风险', score };
    return { riskLevel: 'none', riskText: '无风险', score };
  }
}

export const indicatorCalculator = new IndicatorCalculator();
