import { useEffect, useState } from "react";
import type {
  CountriesData,
  PerCountryDatum,
  PerCountryYearly,
  SubjectRow,
  InstitutionRow,
  YearlyDatum,
} from "../types";

export interface AppData {
  countries: CountriesData;
  yearly: YearlyDatum[];
  perCountry: PerCountryDatum[];
  perCountryYearly: PerCountryYearly[];
  groupSubjects: { "125": SubjectRow[]; "135": SubjectRow[] };
  countrySubjects: Record<string, { name_cn: string; subjects: SubjectRow[] }>;
  institutions: {
    cn_125: InstitutionRow[];
    cn_135: InstitutionRow[];
    ceec_125: InstitutionRow[];
    ceec_135: InstitutionRow[];
  };
}

async function fetchJson<T>(name: string): Promise<T> {
  const r = await fetch(`./data/${name}.json`);
  if (!r.ok) throw new Error(`Failed to fetch ${name}.json`);
  return r.json();
}

export function useData(): AppData | null {
  const [data, setData] = useState<AppData | null>(null);
  useEffect(() => {
    Promise.all([
      fetchJson<CountriesData>("countries"),
      fetchJson<YearlyDatum[]>("yearly"),
      fetchJson<PerCountryDatum[]>("per_country"),
      fetchJson<PerCountryYearly[]>("per_country_yearly"),
      fetchJson<AppData["groupSubjects"]>("group_subjects"),
      fetchJson<AppData["countrySubjects"]>("country_subjects"),
      fetchJson<AppData["institutions"]>("institutions"),
    ]).then(([countries, yearly, perCountry, perCountryYearly, groupSubjects, countrySubjects, institutions]) => {
      setData({ countries, yearly, perCountry, perCountryYearly, groupSubjects, countrySubjects, institutions });
    });
  }, []);
  return data;
}
