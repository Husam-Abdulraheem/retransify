import React, { useState } from 'react';

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <div className="home-page">
      <h1>Welcome to the Home Page</h1>
      <p>This is a test project to check conversion.</p>
      <div className="counter">
        <p>Count: {count}</p>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
    </div>
  );
}
