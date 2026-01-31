import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <nav className="navbar">
      <Link to="/">Home</Link> | <Link to="/about">About</Link>
    </nav>
  );
}
