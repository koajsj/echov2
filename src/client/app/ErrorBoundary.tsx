import { Component } from "react";
import type { ReactNode } from "react";
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main><h1>页面暂时不可用</h1><p>未收集聊天、凭据或错误堆栈。请重新载入页面。</p><a href="/">重新打开 Echo</a></main>:this.props.children;}
}
