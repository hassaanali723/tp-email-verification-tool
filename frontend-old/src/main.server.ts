import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideServerRendering } from '@angular/platform-server';
import { AppComponent } from './app/app.component';
import { provideClientHydration } from '@angular/platform-browser';

 const bootstrap = () =>
  bootstrapApplication(AppComponent, {
    providers: [
      provideHttpClient(),
      provideServerRendering(), // Required for SSR
      provideClientHydration() 
    ],
  });

  export default bootstrap;