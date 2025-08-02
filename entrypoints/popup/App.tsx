import { useState } from "react";
import reactLogo from "@/assets/react.svg";
import wxtLogo from "/wxt.svg";
import { Button } from "@/components/ui/button";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="w-[300px] h-[500px]">
      <h1 className="text-3xl font-bold underline">Hello World</h1>
      <Button>
        This is a button, click me!
      </Button>
    </div>
  );
}

export default App;
