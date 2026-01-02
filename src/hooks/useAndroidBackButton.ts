import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toast } from '@/hooks/use-toast';

/**
 * Custom hook to handle Android back button behavior
 * Features:
 * 1. Navigate back through React Router history
 * 2. Double-tap to exit when at root/dashboard
 * 3. Works only on Android native platform
 */
export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressRef = useRef<number>(0);
  const isNative = Capacitor.isNativePlatform();
  const DOUBLE_TAP_INTERVAL = 2000; // 2 seconds for double-tap

  useEffect(() => {
    // Only register back button handler on native Android platform
    if (!isNative) {
      console.log('[BackButton] Not running on native platform, skipping back button handler');
      return;
    }

    console.log('[BackButton] Registering back button handler');

    let listenerHandle: any = null;

    // Register listener asynchronously
    const registerListener = async () => {
      listenerHandle = await App.addListener('backButton', (event) => {
        console.log('[BackButton] Back button pressed, current path:', location.pathname);
        
        // Check if we can go back in navigation history
        const canGoBack = event.canGoBack;
        
        // Define root paths where double-tap exit should work
        const rootPaths = ['/', '/dashboard', '/auth'];
        const isAtRoot = rootPaths.some(path => location.pathname === path) || 
                         location.pathname.match(/^\/dashboard\/[^\/]+$/); // Dashboard with slug only
        
        if (!canGoBack || isAtRoot) {
          // We're at a root level - check for double-tap to exit
          const currentTime = Date.now();
          const timeSinceLastPress = currentTime - lastBackPressRef.current;
          
          if (timeSinceLastPress < DOUBLE_TAP_INTERVAL) {
            // Second tap within interval - exit app
            console.log('[BackButton] Double-tap detected - exiting app');
            App.exitApp();
          } else {
            // First tap - show toast and set timestamp
            console.log('[BackButton] First tap - showing exit prompt');
            lastBackPressRef.current = currentTime;
            
            toast({
              title: "Press back again to exit",
              description: "Tap back button again to close the app",
              duration: 2000,
            });
          }
        } else {
          // We can navigate back - use React Router navigation
          console.log('[BackButton] Navigating back in history');
          navigate(-1);
        }
      });
    };

    registerListener();

    // Cleanup listener on unmount
    return () => {
      console.log('[BackButton] Removing back button handler');
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [isNative, location.pathname, navigate]);
};
