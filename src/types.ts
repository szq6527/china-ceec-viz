export interface Country {
  en: string;
  cn: string;
  iso: string;
  lat: number;
  lon: number;
}

export interface YearlyDatum {
  year: number;
  ceec: number;
  china_total: number;
  ratio: number;
}

export interface PerCountryDatum {
  name_cn: string;
  iso: string;
  count_135: number;
  count_125: number;
  ratio_135: number;
  rank_135: number;
  rank_125: number;
  growth: number;
  rank_change: number;
}

export interface PerCountryYearly {
  iso: string;
  name_cn: string;
  total: number;
  growth: number;
  yearly: { year: number; count: number }[];
}

export interface SubjectRow {
  code: string;
  en: string;
  cn: string;
  count: number;
}

export interface InstitutionRow {
  en: string;
  cn: string;
  country: string;
  count: number;
}

export interface CountriesData {
  beijing: { name: string; lat: number; lon: number };
  ceec: Country[];
}
