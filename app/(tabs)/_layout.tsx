import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DrawerLayout() {
  const colorScheme = useColorScheme();

  return (
    <Drawer
      screenOptions={{
        headerShown: true, // Show header to see the hamburger menu
        drawerActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        drawerInactiveTintColor: Colors[colorScheme ?? 'light'].text,
        drawerStyle: { 
          width: 240,
        },
        headerStyle: {
          backgroundColor: Colors[colorScheme ?? 'light'].background,
        },
        headerTintColor: Colors[colorScheme ?? 'light'].text,
        // Add space between icon and title
        drawerLabelStyle: {
          marginLeft: 8, // Increased from -16 to 8 for proper spacing
        },
        // You can also adjust icon style if needed
        drawerIconStyle: {
          marginRight: 8,
        },
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: 'Home',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      
      {/* Add more screens here */}
      <Drawer.Screen
        name="profile"
        options={{
          title: 'Profile',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      
      <Drawer.Screen
        name="settings"
        options={{
          title: 'Settings',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      /><Drawer.Screen
        name="history"
        options={{
          title: 'History',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="vehicles"
        options={{
          title: 'My Vehicles',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="car" size={size} color={color} />
          ),
        }}
      />
      
      {/* Add more drawer screens as needed */}
    </Drawer>
  );
}
 