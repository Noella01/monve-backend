import { useEffect, useState } from 'react';
import { apiFetch } from '../services/http';
export function PrivateImage({id,alt,token}:{id:string;alt:string;token?:string}){
  const [url,setUrl]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let active=true,objectUrl='';void apiFetch(`/api/media/${encodeURIComponent(id)}`,{headers:token?{'X-Tracking-Token':token}:{}}).then(async response=>{if(!response.ok)throw new Error('Reference image is unavailable.');const blob=await response.blob();if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[id,token]);
  return error?<p role="status">{error}</p>:url?<img src={url} alt={alt} className="max-h-64 max-w-full object-contain"/>:<p>Loading reference image…</p>;
}
