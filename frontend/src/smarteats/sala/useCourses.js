import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';

// Le portate del locale, in ordine d'uscita (solo quelle attive). Si caricano una volta: cambiano raramente.
export function useCourses() {
  const [courses, setCourses] = useState([]);
  useEffect(() => {
    fetchWithAuth('/courses').then(list => setCourses(list.filter(c => c.active))).catch(() => setCourses([]));
  }, []);
  return courses;
}
