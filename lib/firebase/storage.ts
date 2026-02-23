import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage } from "./config";

export async function uploadFile(
  tenantId: string,
  folder: string,
  file: File,
  fileName?: string
): Promise<{ url: string; path: string }> {
  const name = fileName ?? `${Date.now()}_${file.name}`;
  const path = `tenants/${tenantId}/${folder}/${name}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { tenantId, originalName: file.name },
  });

  const url = await getDownloadURL(storageRef);
  return { url, path };
}

export async function deleteFile(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

export function getFileRef(path: string) {
  return ref(storage, path);
}
