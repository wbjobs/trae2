import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class HttpService {
  private baseUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient) {}

  private getUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${this.baseUrl}${url}`;
  }

  get<T>(url: string, options?: any): Observable<T> {
    return this.http.get<T>(this.getUrl(url), options);
  }

  post<T>(url: string, data?: any, options?: any): Observable<T> {
    return this.http.post<T>(this.getUrl(url), data, options);
  }

  put<T>(url: string, data?: any, options?: any): Observable<T> {
    return this.http.put<T>(this.getUrl(url), data, options);
  }

  delete<T>(url: string, options?: any): Observable<T> {
    return this.http.delete<T>(this.getUrl(url), options);
  }
}
