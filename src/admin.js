import { supabase } from './auth.js';

export async function currentProfile(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return null;
  const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).single();
  if(error) throw error;
  return data;
}
export async function listCommercials(){
  const {data,error}=await supabase.rpc('admin_list_profiles');
  if(error) throw error; return data||[];
}
export async function setModule(userId,moduleKey,enabled){
  const {error}=await supabase.rpc('admin_set_module',{target_user:userId,key:moduleKey,value:enabled});
  if(error) throw error; return {userId,moduleKey,enabled};
}
