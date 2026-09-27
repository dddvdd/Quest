import { useEffect, useState } from 'react'

// Reusable Philippine address cascade (Province → Municipality/City → Barangay)
// backed by PSGC. Mirrors the applicant RegisterPage behaviour.

export function ensureArray(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

async function fetchFirst(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        const list = ensureArray(json)
        if (list.length > 0) return list
      }
    } catch (err) {
      console.warn(`Failed fetching ${url}:`, err)
    }
  }
  return []
}

export default function usePhAddress() {
  const [provinces, setProvinces] = useState([])
  const [municipalities, setMunicipalities] = useState([])
  const [barangays, setBarangays] = useState([])

  useEffect(() => {
    ;(async () => {
      const list = await fetchFirst([
        'https://psgc.cloud/api/v2/provinces',
        'https://psgc.gitlab.io/philippine-addresses/api/provinces.json',
      ])
      setProvinces(list)
    })()
  }, [])

  async function loadMunicipalities(provinceName) {
    setMunicipalities([])
    setBarangays([])
    const p = ensureArray(provinces).find((item) => item?.name === provinceName)
    if (!p?.code) return
    const list = await fetchFirst([
      `https://psgc.cloud/api/v2/provinces/${encodeURIComponent(p.code)}/cities-municipalities`,
      `https://psgc.gitlab.io/philippine-addresses/api/provinces/${encodeURIComponent(p.code)}/cities-municipalities.json`,
    ])
    setMunicipalities(list)
  }

  async function loadBarangays(municipalityName) {
    setBarangays([])
    const m = ensureArray(municipalities).find((item) => item?.name === municipalityName)
    if (!m?.code) return
    const list = await fetchFirst([
      `https://psgc.cloud/api/v2/cities-municipalities/${encodeURIComponent(m.code)}/barangays`,
      `https://psgc.gitlab.io/philippine-addresses/api/cities-municipalities/${encodeURIComponent(m.code)}/barangays.json`,
    ])
    setBarangays(list)
  }

  return {
    provinces: ensureArray(provinces),
    municipalities: ensureArray(municipalities),
    barangays: ensureArray(barangays),
    loadMunicipalities,
    loadBarangays,
  }
}
