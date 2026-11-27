"use client";
import {useState} from "react";
import {resetDemo} from "@/lib/demo/store";
export function ResetDemo() {
  const [error, setError] = useState(false);
  return <><button className="ml-auto underline" onClick={() => {try {resetDemo(); window.location.reload();} catch {setError(true);}}}>Reset demo</button>
    {error && <span role="alert">Allow tab storage to reset this demo.</span>}</>;
}
